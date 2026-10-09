"use strict";
const Mutation = require("../../models/subscriptionMutation.model");
const Order = require("../../models/order.model");
const stripe = require("../../utils/stripe.util");
const { listRefunds } = require("./subscriptionRefundSettlement.service");

async function refundItemDecrease(subscription, amountMinor, operationId, targets) {
  const mutation = operationId && await Mutation.findOne({ customer: subscription.customer,
    subscription: subscription._id, operationId });
  if (!mutation) throw new Error("A saved operation is required before returning card payment.");
  let plan = mutation.decreaseRefundSnapshot;
  if (!plan) {
    if (!targets?.length || targets.reduce((sum, target) => sum + target.amountMinor, 0) !== amountMinor) {
      throw new Error("The changed delivery refund targets are required. No refund was started.");
    }
    const steps = [];
    for (const target of targets) {
      const order = await Order.findOne({ _id: target.orderId, subscription: subscription._id,
        status: { $in: ["paid", "partially_refunded"] }, deliveryStatus: "ordered",
        stripePaymentIntentId: { $ne: null },
      }).select("_id stripePaymentIntentId").lean();
      if (!order) throw new Error("No captured payment for the changed delivery was found. No refund or credit was started.");
    const stepKey = `subscription:${subscription._id}:mutation:${operationId}:decrease`;
      steps.push({ orderId: String(order._id), amountMinor: target.amountMinor,
        idempotencyKey: `${stepKey}:order:${order._id}:refund`, params: { payment_intent: order.stripePaymentIntentId,
        amount: target.amountMinor, metadata: { subscriptionId: String(subscription._id),
          subscriptionNumber: subscription.subscriptionNumber, orderId: String(order._id),
          type: "subscription_decrease_refund", refundStepKey: `${stepKey}:order:${order._id}` } } });
    }
    plan = { amountMinor, startedAt: new Date(), steps };
    const saved = await Mutation.updateOne({ _id: mutation._id, decreaseRefundSnapshot: null },
      { $set: { decreaseRefundSnapshot: plan } });
    if (!saved.matchedCount) throw new Error("The decrease refund plan could not be saved. No refund was started.");
  }
  if (plan.amountMinor !== amountMinor) throw new Error("Retry the original decrease refund before changing its amount.");
  // Retain compatibility with operations saved before per-delivery targeting.
  const steps = plan.steps || [plan];
  const records = [];
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
  let refund = step.refund?.id ? await stripe.refunds.retrieve(step.refund.id) : null;
  if (!refund && Date.now() - new Date(plan.startedAt).getTime() >= 23 * 3600000) {
    const matches = (await listRefunds(step.params.payment_intent)).filter(candidate =>
      candidate.metadata?.refundStepKey === step.params.metadata.refundStepKey);
    if (matches.length !== 1 || matches[0].amount !== step.amountMinor) {
      throw new Error("This aged decrease refund needs support reconciliation. Another refund or store credit will not be created.");
    }
    refund = matches[0];
  }
  if (!refund) refund = await stripe.refunds.create(step.params, { idempotencyKey: step.idempotencyKey });
  const path = plan.steps ? `decreaseRefundSnapshot.steps.${index}.refund` : "decreaseRefundSnapshot.refund";
  const recorded = await Mutation.updateOne({ _id: mutation._id }, { $set: { [path]: refund } });
  if (!recorded.matchedCount) throw new Error("The decrease refund checkpoint could not be saved.");
  if (refund.status !== "succeeded" || refund.amount !== step.amountMinor ||
      (refund.payment_intent && (typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent.id) !== step.params.payment_intent)) {
    throw new Error("The decrease card refund is not confirmed successful. Retry the original refund; store credit is blocked.");
  }
    records.push({ refundedMinor: step.amountMinor, stripeRefundId: refund.id, orderId: step.orderId,
      paymentIntentId: step.params.payment_intent, currency: refund.currency || "gbp" });
  }
  return { ...records[0], refundedMinor: amountMinor, records };
}
module.exports = { refundItemDecrease };
