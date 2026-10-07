"use strict";
const crypto = require('crypto');
const Subscription = require('../../models/subscription.model');

// Use the portal's lock field so provider events and customer changes cannot
// simultaneously read and replace the same lifecycle state.
async function withSubscriptionLifecycleLock(stripeSubscriptionId, execute, { ignoreMissing = false } = {}) {
  if (!stripeSubscriptionId) return;
  const operationId = `webhook:${crypto.randomUUID()}`;
  const now = new Date();
  const claimed = await Subscription.findOneAndUpdate({ stripeSubscriptionId,
    $or: [{ customerMutationLock: null }, { customerMutationLock: { $exists: false } },
      { 'customerMutationLock.lockedAt': { $lte: new Date(now.getTime() - 120000) } }],
  }, { $set: { customerMutationLock: { operationId, lockedAt: now } } },
  { new: true, timestamps: false }).select('_id');
  if (!claimed) {
    if (ignoreMissing && !await Subscription.exists({ stripeSubscriptionId })) return;
    // Do not acknowledge a competing event; Stripe/reconciliation must retry.
    throw new Error('Subscription lifecycle is busy or not ready; retry this webhook.');
  }
  const owned = { _id: claimed._id, 'customerMutationLock.operationId': operationId };
  const heartbeat = startSubscriptionLockHeartbeat(claimed._id, operationId);
  try { return await execute(); }
  finally {
    clearInterval(heartbeat);
    await Subscription.updateOne(owned, { $unset: { customerMutationLock: 1 } }, { timestamps: false });
  }
}
function startSubscriptionLockHeartbeat(subscriptionId, operationId) {
  if (!subscriptionId || !operationId) return null;
  const heartbeat = setInterval(() => {
    Subscription.updateOne({ _id: subscriptionId, 'customerMutationLock.operationId': operationId },
      { $set: { 'customerMutationLock.lockedAt': new Date() } }, { timestamps: false }).catch(() => {});
  }, 20000);
  heartbeat.unref();
  return heartbeat;
}
module.exports = { withSubscriptionLifecycleLock, startSubscriptionLockHeartbeat };
