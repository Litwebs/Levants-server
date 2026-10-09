"use strict";
const mongoose = require("mongoose");
const Subscription = require("../../models/subscription.model");
const Plan = require("../../models/subscriptionInvoiceFulfillment.model");
const Order = require("../../models/order.model");
const Payment = require("../../models/payment.model");
const stripe = require("../../utils/stripe.util");
const { listRefunds } = require("../customerPortal/subscriptionRefundSettlement.service");
const { releaseStock } = require("./subscriptionStock.service");
const { freezeInvoiceFulfillment } = require("./subscriptionInvoiceFulfillment.service");
const idOf = value => typeof value === "string" ? value : value?.id;

// This recovery is limited to invoices with no allocated fulfillment. An
// invoice with any delivered/created order requires a per-order repair.
async function refundUnfulfilledInvoice(invoice, reason) {
  const webhook = require("./subscriptionWebhook.service");
  const subscription = await Subscription.findOne({
    stripeSubscriptionId: webhook.resolveInvoiceSubscriptionId(invoice),
  }).populate("customer");
  if (!subscription?.customer?.stripeCustomerId) throw new Error("Unfulfilled invoice owner is unavailable.");
  const paymentIntentId = webhook.resolveInvoicePaymentIntentId(invoice);
  if (!paymentIntentId || !Number.isSafeInteger(invoice.amount_paid) || invoice.amount_paid <= 0) {
    throw new Error("The unfulfilled invoice has no verified card capture; support reconciliation is required.");
  }
  if (await Order.exists({ $or: [
    { subscription: subscription._id, stripeInvoiceId: invoice.id },
    { stripePaymentIntentId: paymentIntentId }, { "paymentAllocations.paymentIntentId": paymentIntentId },
  ] })) throw new Error("The unfulfilled invoice already has payment allocations; a per-order repair is required.");
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status !== "succeeded" || intent.amount_received !== invoice.amount_paid ||
      idOf(intent.customer) !== subscription.customer.stripeCustomerId || intent.currency !== "gbp" ||
      invoice.currency !== "gbp") throw new Error("The unfulfilled invoice capture does not match its owner, currency and amount.");
  const plan = await freezeInvoiceFulfillment({ subscriptionId: subscription._id, invoiceId: invoice.id,
    build: async () => ({ paymentIntentId, billingWindowStart: new Date((invoice.period_start || invoice.created) * 1000),
      billingWindowEnd: new Date((invoice.period_end || invoice.created) * 1000), deliveries: [], legacyReviewRequired: true,
      inventoryKey: subscription.initialInvoiceId === invoice.id ? subscription.initialInventoryKey : null }) });
  if (plan.refundedAt) return { refundedMinor: invoice.amount_paid, stripeRefundId: plan.refundSnapshot?.refund?.id };
  let snapshot = plan.refundSnapshot;
  if (!snapshot) {
    if ((await listRefunds(paymentIntentId)).some(refund => !["failed", "canceled"].includes(refund.status))) {
      throw new Error("An external invoice refund needs reconciliation before returning more money.");
    }
    const key = `subscription:${subscription._id}:invoice:${invoice.id}:unfulfilled-refund`;
    snapshot = { startedAt: new Date(), reason, idempotencyKey: key, params: {
      payment_intent: paymentIntentId, amount: invoice.amount_paid,
      metadata: { subscriptionId: String(subscription._id), invoiceId: invoice.id,
        type: "subscription_unfulfilled_invoice_refund", refundStepKey: key },
    } };
    const saved = await Plan.updateOne({ _id: plan._id, refundSnapshot: null }, { $set: { refundSnapshot: snapshot } });
    if (!saved.matchedCount) throw new Error("The unfulfilled invoice refund plan could not be saved.");
  }
  const ledgerKey = `unfulfilled:${subscription._id}:${invoice.id}`;
  await Payment.findOneAndUpdate({ subscriptionInvoiceKey: ledgerKey }, { $setOnInsert: {
    customer: subscription.customer._id, subscription: subscription._id, amount: invoice.amount_paid / 100,
    currency: invoice.currency, status: "paid", providerReference: paymentIntentId,
    subscriptionInvoiceKey: ledgerKey, paidAt: new Date(), notes: `Unfulfilled invoice ${invoice.id}`,
  } }, { upsert: true, new: true });
  await stripe.subscriptions.update(subscription.stripeSubscriptionId, { pause_collection: { behavior: "void" } });
  let refund = snapshot.refund?.id ? await stripe.refunds.retrieve(snapshot.refund.id) : null;
  if (!refund && Date.now() - new Date(snapshot.startedAt).getTime() >= 23 * 3600000) {
    const matches = (await listRefunds(paymentIntentId)).filter(candidate =>
      candidate.metadata?.refundStepKey === snapshot.params.metadata.refundStepKey);
    if (matches.length !== 1 || matches[0].amount !== invoice.amount_paid) throw new Error("The aged invoice refund needs reconciliation.");
    refund = matches[0];
  }
  if (!refund) refund = await stripe.refunds.create(snapshot.params, { idempotencyKey: snapshot.idempotencyKey });
  const recorded = await Plan.updateOne({ _id: plan._id }, { $set: { "refundSnapshot.refund": refund } });
  if (!recorded.matchedCount) throw new Error("The invoice refund checkpoint could not be saved.");
  if (refund.status !== "succeeded" || refund.amount !== invoice.amount_paid ||
      (refund.payment_intent && idOf(refund.payment_intent) !== paymentIntentId)) {
    throw new Error("The unfulfilled invoice refund has not been confirmed; retry its original recovery.");
  }
  await mongoose.connection.transaction(async session => {
    if (await Order.exists({ subscription: subscription._id, stripeInvoiceId: invoice.id }).session(session)) {
      throw new Error("The refunded invoice has a fulfillment order; reconciliation is required.");
    }
    if (plan.inventoryKey) await releaseStock({ key: plan.inventoryKey, session });
    await Payment.updateOne({ subscriptionInvoiceKey: ledgerKey }, { $set: { status: "refunded", refundedAt: new Date() } }, { session });
    await Plan.updateOne({ _id: plan._id }, { $set: { refundedAt: new Date(), completedAt: new Date() } }, { session });
    await Subscription.updateOne({ _id: subscription._id }, {
      $set: { status: "paused", pauseReason: "reconciliation", pausedAt: new Date() },
    }, { session });
  });
  return { refundedMinor: invoice.amount_paid, stripeRefundId: refund.id };
}
module.exports = { refundUnfulfilledInvoice };
