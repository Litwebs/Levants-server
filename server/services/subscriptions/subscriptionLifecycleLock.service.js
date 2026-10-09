"use strict";
const crypto = require('crypto');
const Subscription = require('../../models/subscription.model');
const Mutation = require('../../models/subscriptionMutation.model');

// Use the portal's lock field so provider events and customer changes cannot
// simultaneously read and replace the same lifecycle state.
async function withSubscriptionLifecycleLock(stripeSubscriptionId, execute, { ignoreMissing = false, subscriptionId } = {}) {
  if (!stripeSubscriptionId && !subscriptionId) return;
  const target = subscriptionId ? { _id: subscriptionId } : { stripeSubscriptionId };
  const operationId = `webhook:${crypto.randomUUID()}`;
  const now = new Date();
  const claimed = await Subscription.findOneAndUpdate({ ...target,
    $or: [{ customerMutationLock: null }, { customerMutationLock: { $exists: false } },
      { 'customerMutationLock.lockedAt': { $lte: new Date(now.getTime() - 120000) } }],
  }, { $set: { customerMutationLock: { operationId, lockedAt: now } } },
  { new: true, timestamps: false }).select('_id');
  if (!claimed) {
    if (ignoreMissing && !await Subscription.exists(target)) return;
    // Do not acknowledge a competing event; Stripe/reconciliation must retry.
    throw Object.assign(new Error('Subscription lifecycle is busy or not ready; retry this webhook.'), {
      statusCode: 503, code: 'SUBSCRIPTION_LIFECYCLE_BUSY',
    });
  }
  const owned = { _id: claimed._id, 'customerMutationLock.operationId': operationId };
  const heartbeat = startSubscriptionLockHeartbeat(claimed._id, operationId);
  try {
    if (await Mutation.exists({ subscription: claimed._id,
      'addOnSnapshot.settlement': { $ne: null }, 'addOnSnapshot.settlement.completedAt': null,
    })) throw Object.assign(new Error('A paid add-on settlement is unfinished; retry this webhook.'), {
      statusCode: 503, code: 'SUBSCRIPTION_LIFECYCLE_BUSY',
    });
    return await execute();
  }
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
