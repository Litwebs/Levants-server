"use strict";
const mongoose = require("mongoose");
const Mutation = require("../../models/subscriptionMutation.model");
const Delivery = require("../../models/subscriptionDelivery.model");
const Order = require("../../models/order.model");
const Payment = require("../../models/payment.model");
const stripe = require("../../utils/stripe.util");
const { listRefunds } = require("./subscriptionRefundSettlement.service");
const idOf = value => typeof value === "string" ? value : value?.id;

async function refundUnfulfilledAddOn(subscription, mutation) {
  const snapshot = mutation.addOnSnapshot;
  const intent = await stripe.paymentIntents.retrieve(snapshot.paymentIntent.id);
  if (intent.status !== "succeeded" || intent.amount_received !== snapshot.amountMinor ||
      idOf(intent.customer) !== snapshot.chargeParams.customer || intent.currency !== snapshot.chargeParams.currency) {
    throw new Error("The unfulfilled payment does not match its saved purchase. Support reconciliation is required.");
  }
  let plan = snapshot.unfulfilledRefund;
  if (!plan) {
    if ((await listRefunds(intent.id)).some(refund => !["failed", "canceled"].includes(refund.status))) {
      throw new Error("An external add-on refund needs reconciliation before returning more money.");
    }
    const key = `subscription:${subscription._id}:add-on:${mutation.operationId}:unfulfilled-refund`;
    plan = { startedAt: new Date(), idempotencyKey: key, params: {
      payment_intent: intent.id, amount: snapshot.amountMinor, metadata: {
        subscriptionId: String(subscription._id), operationId: mutation.operationId,
        type: "subscription_unfulfilled_add_on_refund", refundStepKey: key,
      } } };
    const saved = await Mutation.updateOne({ _id: mutation._id, "addOnSnapshot.unfulfilledRefund": null },
      { $set: { "addOnSnapshot.unfulfilledRefund": plan } });
    if (!saved.matchedCount) throw new Error("The unfulfilled refund plan could not be saved.");
  }
  let refund = plan.refund?.id ? await stripe.refunds.retrieve(plan.refund.id) : null;
  if (!refund && Date.now() - new Date(plan.startedAt).getTime() >= 23 * 3600000) {
    const matches = (await listRefunds(intent.id)).filter(candidate =>
      candidate.metadata?.refundStepKey === plan.params.metadata.refundStepKey);
    if (matches.length !== 1 || matches[0].amount !== snapshot.amountMinor) {
      throw new Error("The aged unfulfilled refund needs reconciliation; another refund will not be created.");
    }
    refund = matches[0];
  }
  if (!refund) refund = await stripe.refunds.create(plan.params, { idempotencyKey: plan.idempotencyKey });
  const recorded = await Mutation.updateOne({ _id: mutation._id },
    { $set: { "addOnSnapshot.unfulfilledRefund.refund": refund } });
  if (!recorded.matchedCount) throw new Error("The unfulfilled refund checkpoint could not be saved.");
  if (refund.status !== "succeeded" || refund.amount !== snapshot.amountMinor ||
      (refund.payment_intent && idOf(refund.payment_intent) !== intent.id)) {
    throw new Error("The unfulfilled refund is not yet confirmed. Retry the original purchase to finish recovery.");
  }
  const response = { success: true,
    message: "The original delivery could not accept this add-on. Its payment has been refunded to your card.",
    data: { paymentOutcome: "refunded", refundedMinor: snapshot.amountMinor, stripeRefundId: refund.id } };
  await mongoose.connection.transaction(async session => {
    const delivery = await Delivery.findById(snapshot.deliveryId).session(session);
    const order = delivery?.order ? await Order.findById(delivery.order).session(session) : null;
    if (delivery?.addOns?.some(addOn => addOn.operationId === mutation.operationId) ||
        order?.paymentAllocations?.some(allocation => allocation.idempotencyKey === `delivery-add-on:${mutation.operationId}`)) {
      throw new Error("The refunded purchase has a fulfillment allocation; support reconciliation is required.");
    }
    const ledger = await Payment.updateOne({ subscription: subscription._id, providerReference: intent.id },
      { $set: { status: "refunded", refundedAt: new Date() } }, { session });
    if (!ledger.matchedCount) throw new Error("The refunded add-on payment ledger is missing.");
    const completed = await Mutation.updateOne({ _id: mutation._id }, { $set: {
      "addOnSnapshot.unfulfilledRefund.completedAt": new Date(), status: "completed",
      response, completedAt: new Date(), lastError: null,
    } }, { session });
    if (!completed.matchedCount) throw new Error("The unfulfilled purchase completion could not be saved.");
  });
  return response;
}
module.exports = { refundUnfulfilledAddOn };
