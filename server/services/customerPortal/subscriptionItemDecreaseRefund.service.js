"use strict";
const Mutation = require("../../models/subscriptionMutation.model");
const Order = require("../../models/order.model");
const stripe = require("../../utils/stripe.util");
const { listRefunds } = require("./subscriptionRefundSettlement.service");

async function refundItemDecrease(subscription, amountMinor, operationId) {
  const mutation = operationId && await Mutation.findOne({ customer: subscription.customer,
    subscription: subscription._id, operationId });
  if (!mutation) throw new Error("A saved operation is required before returning card payment.");
  let plan = mutation.decreaseRefundSnapshot;
  if (!plan) {
    const order = await Order.findOne({ subscription: subscription._id,
      status: { $in: ["paid", "partially_refunded"] }, deliveryStatus: "ordered",
      stripePaymentIntentId: { $ne: null },
    }).sort({ deliveryDate: 1 }).select("_id stripePaymentIntentId").lean();
    if (!order) throw new Error("No captured upcoming delivery payment was found. No refund or credit was started.");
    const stepKey = `subscription:${subscription._id}:mutation:${operationId}:decrease`;
    plan = { orderId: String(order._id), amountMinor, startedAt: new Date(),
      idempotencyKey: `${stepKey}:refund`, params: { payment_intent: order.stripePaymentIntentId,
        amount: amountMinor, metadata: { subscriptionId: String(subscription._id),
          subscriptionNumber: subscription.subscriptionNumber, orderId: String(order._id),
          type: "subscription_decrease_refund", refundStepKey: stepKey } } };
    const saved = await Mutation.updateOne({ _id: mutation._id, decreaseRefundSnapshot: null },
      { $set: { decreaseRefundSnapshot: plan } });
    if (!saved.matchedCount) throw new Error("The decrease refund plan could not be saved. No refund was started.");
  }
  if (plan.amountMinor !== amountMinor) throw new Error("Retry the original decrease refund before changing its amount.");
  let refund = plan.refund?.id ? await stripe.refunds.retrieve(plan.refund.id) : null;
  if (!refund && Date.now() - new Date(plan.startedAt).getTime() >= 23 * 3600000) {
    const matches = (await listRefunds(plan.params.payment_intent)).filter(candidate =>
      candidate.metadata?.refundStepKey === plan.params.metadata.refundStepKey);
    if (matches.length !== 1 || matches[0].amount !== amountMinor) {
      throw new Error("This aged decrease refund needs support reconciliation. Another refund or store credit will not be created.");
    }
    refund = matches[0];
  }
  if (!refund) refund = await stripe.refunds.create(plan.params, { idempotencyKey: plan.idempotencyKey });
  const recorded = await Mutation.updateOne({ _id: mutation._id }, { $set: { "decreaseRefundSnapshot.refund": refund } });
  if (!recorded.matchedCount) throw new Error("The decrease refund checkpoint could not be saved.");
  if (refund.status !== "succeeded" || refund.amount !== amountMinor ||
      (refund.payment_intent && (typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent.id) !== plan.params.payment_intent)) {
    throw new Error("The decrease card refund is not confirmed successful. Retry the original refund; store credit is blocked.");
  }
  return { refundedMinor: amountMinor, stripeRefundId: refund.id, orderId: plan.orderId,
    paymentIntentId: plan.params.payment_intent, currency: refund.currency || "gbp" };
}
module.exports = { refundItemDecrease };
