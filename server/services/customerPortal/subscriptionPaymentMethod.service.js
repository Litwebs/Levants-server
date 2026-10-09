"use strict";
const crypto = require("crypto");
const Customer = require("../../models/customer.model");
const mongoose = require("mongoose");
const PaymentMethod = require("../../models/paymentMethod.model");
const Subscription = require("../../models/subscription.model");
const stripe = require("../../utils/stripe.util");
const idOf = value => typeof value === "string" ? value : value?.id || null;

async function liveStripeSubscriptions(customerId) {
  const subscriptions = [];
  let cursor;
  do {
    const page = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100,
      ...(cursor ? { starting_after: cursor } : {}),
    });
    subscriptions.push(...page.data.filter(sub => !["canceled", "incomplete_expired"].includes(sub.status)));
    if (!page.has_more) break;
    const next = page.data.at(-1)?.id;
    if (!next || next === cursor) throw new Error("Subscription pagination did not advance");
    cursor = next;
  } while (true);
  return subscriptions;
}

async function cardIsUsedBySubscription(customer, method) {
  const subscriptions = await liveStripeSubscriptions(customer.stripeCustomerId);
  if (!subscriptions.length) return false;
  const remoteCustomer = await stripe.customers.retrieve(customer.stripeCustomerId);
  const customerDefault = idOf(remoteCustomer.invoice_settings?.default_payment_method) || idOf(remoteCustomer.default_source);
  return subscriptions.some(subscription => {
    const effectiveCard = idOf(subscription.default_payment_method) || idOf(subscription.default_source) || customerDefault;
    // Unknown backing is not evidence that removing the customer's default is safe.
    return effectiveCard === method.providerReference || (!effectiveCard && method.isDefault);
  });
}

const RECOVERY_WINDOW_MS = 23 * 60 * 60 * 1000;
const LEASE_MS = 2 * 60 * 1000;

async function runCardOperation(customer, method, kind, verifiedStripeMethod) {
  const token = crypto.randomUUID();
  const now = new Date();
  const locked = await Customer.findOneAndUpdate({ _id: customer._id,
    $or: [{ paymentMethodLock: null }, { 'paymentMethodLock.expiresAt': { $lte: now } }],
  }, { $set: { paymentMethodLock: { token, expiresAt: new Date(now.getTime() + LEASE_MS) } } },
  { new: true }).select('+paymentMethodOperation');
  if (!locked) throw new Error('Another card update is in progress. Please retry shortly.');
  const owned = { _id: customer._id, 'paymentMethodLock.token': token };
  try {
    await require("../../utils/subscriptionLease.util").withLease({ kind: "customer", id: locked._id, token }, async () => {
    let operation = locked.paymentMethodOperation;
    if (operation && (operation.kind !== kind || operation.methodId !== String(method._id))) {
      throw new Error('An earlier card update is unfinished. Retry that card update before changing or deleting another card.');
    }
    if (!operation) {
      // Re-read under the customer lock: callers may have loaded a card before
      // another request deleted it or changed its default status.
      const saved = await PaymentMethod.findOne({ _id: method._id, customer: customer._id }).select('+providerReference');
      if (!saved) throw new Error('The selected card is no longer saved');
      let target = saved;
      if (kind === 'delete') {
        if ((saved.provider === 'stripe' && await cardIsUsedBySubscription(customer, saved)) ||
            await Subscription.exists({ customer: customer._id, paymentMethod: saved._id,
              status: { $in: ['active', 'paused'] } })) {
          throw new Error('This card is used by an active or paused subscription. Set another default card first.');
        }
        target = saved.isDefault ? await PaymentMethod.findOne({ customer: customer._id,
          _id: { $ne: saved._id }, provider: 'stripe' }).select('+providerReference').sort({ createdAt: 1 }) : null;
      }
      const commands = [];
      if (target) {
        if (target.provider !== 'stripe' || !target.providerReference) throw new Error('Please choose a saved Stripe card');
        const card = kind === 'set_default' && verifiedStripeMethod || await stripe.paymentMethods.retrieve(target.providerReference);
        if (card.type !== 'card' || idOf(card.customer) !== customer.stripeCustomerId) {
          throw new Error('This card is not attached to your Stripe customer');
        }
        const subscriptions = await liveStripeSubscriptions(customer.stripeCustomerId);
        for (const subscription of subscriptions) {
          if (subscription.default_payment_method || subscription.default_source) {
            commands.push({ resource: 'subscriptions', id: subscription.id,
              params: { default_payment_method: '', default_source: '' } });
          }
        }
      }
      if (target || (kind === 'delete' && saved.isDefault)) {
        commands.push({ resource: 'customers', id: customer.stripeCustomerId,
          params: { invoice_settings: { default_payment_method: target?.providerReference || null } } });
      }
      if (kind === 'delete' && saved.provider === 'stripe' && saved.providerReference) {
        commands.push({ resource: 'detach', id: saved.providerReference });
      }
      operation = { id: crypto.randomUUID(), kind, methodId: String(saved._id),
        targetId: target ? String(target._id) : null, startedAt: now.toISOString(), commands };
      const recorded = await Customer.updateOne(owned, { $set: { paymentMethodOperation: operation } });
      if (!recorded.matchedCount) throw new Error('Card update lock expired. Please retry.');
    }
    // A replacement worker repeats exactly the same commands and Stripe keys.
    // Never replay beyond Stripe's guaranteed idempotency retention window.
    for (let index = 0; index < operation.commands.length; index++) {
      if (Date.now() - Date.parse(operation.startedAt) >= RECOVERY_WINDOW_MS) {
        throw new Error('This card update needs support reconciliation before another change can be made.');
      }
      const renewed = await Customer.updateOne(owned, { $set: {
        'paymentMethodLock.expiresAt': new Date(Date.now() + LEASE_MS),
      } });
      if (!renewed.matchedCount) throw new Error('Card update lock expired. Please retry.');
      const command = operation.commands[index];
      const options = { idempotencyKey: `customer-card:${operation.id}:${index}` };
      if (command.resource === 'detach') {
        try { await stripe.paymentMethods.detach(command.id, {}, options); }
        catch (error) { if (error.code !== 'resource_missing') throw error; }
      } else {
        await stripe[command.resource].update(command.id, command.params, options);
      }
    }
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Fence stale workers, and commit completion with all local pointers.
        const completed = await Customer.updateOne({ ...owned, 'paymentMethodOperation.id': operation.id },
          { $set: { paymentMethodOperation: null } }, { session });
        if (!completed.matchedCount) throw new Error('Card update lock expired. Please retry.');
        if (operation.targetId) {
          await PaymentMethod.updateMany({ customer: customer._id, isDefault: true }, { $set: { isDefault: false } }, { session });
          const selected = await PaymentMethod.updateOne({ _id: operation.targetId, customer: customer._id },
            { $set: { isDefault: true } }, { session });
          if (!selected.matchedCount) throw new Error('The selected card is no longer saved');
          await Subscription.updateMany({ customer: customer._id, status: { $in: ['active', 'paused'] } },
            { $set: { paymentMethod: operation.targetId } }, { session });
        }
        if (operation.kind === 'delete') {
          await PaymentMethod.deleteOne({ _id: operation.methodId, customer: customer._id }, { session });
        }
      });
    } finally { await session.endSession(); }
    if (kind === 'set_default') method.isDefault = true;
    });
  } finally {
    await Customer.updateOne(owned, { $set: { paymentMethodLock: null } });
  }
}
async function setCustomerDefaultCard(customer, method, verifiedStripeMethod) {
  return runCardOperation(customer, method, 'set_default', verifiedStripeMethod);
}
async function deleteCustomerCard(customer, method) {
  return runCardOperation(customer, method, 'delete');
}
async function resumePendingCardOperation(customerId) {
  const customer = await Customer.findById(customerId).select('+paymentMethodOperation');
  const operation = customer?.paymentMethodOperation;
  if (!operation) return;
  const method = await PaymentMethod.findOne({ _id: operation.methodId, customer: customerId }).select('+providerReference');
  if (!method) throw new Error('The unfinished card update needs support reconciliation.');
  await runCardOperation(customer, method, operation.kind);
}
module.exports = { setCustomerDefaultCard, deleteCustomerCard, resumePendingCardOperation, cardIsUsedBySubscription, liveStripeSubscriptions };
