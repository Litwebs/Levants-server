"use strict";
const Mutation = require("../../models/subscriptionMutation.model");
const Order = require("../../models/order.model");
const Customer = require("../../models/customer.model");
const stripe = require("../../utils/stripe.util");
const { listRefunds } = require("./subscriptionRefundSettlement.service");

async function refundItemDecrease(subscription, amountMinor, operationId, targets) {
  const mutation = operationId && await Mutation.findOne({ customer: subscription.customer,
    subscription: subscription._id, operationId });
  if (!mutation) throw new Error("A saved operation is required before returning card payment.");
  let plan = mutation.decreaseRefundSnapshot;
  if (!plan) {
    const customer = await Customer.findById(subscription.customer?._id || subscription.customer);
    if (!customer?.stripeCustomerId) throw new Error("The captured payment owner cannot be verified. No refund was started.");
    if (!targets?.length || targets.reduce((sum, target) => sum + target.amountMinor, 0) !== amountMinor) {
      throw new Error("The changed delivery refund targets are required. No refund was started.");
    }
    const steps = [];
    const budgets = new Map();
    for (const target of targets) {
      const order = await Order.findOne({ _id: target.orderId, subscription: subscription._id,
        status: { $in: ["paid", "partially_refunded"] }, deliveryStatus: "ordered",
      }).select("_id stripePaymentIntentId paymentAllocations amountPaid refunds").lean();
      if (!order) throw new Error("No captured payment for the changed delivery was found. No refund or credit was started.");
      let remaining = target.amountMinor;
      const allocations = new Map();
      for (const allocation of order.paymentAllocations || []) {
        allocations.set(allocation.paymentIntentId, (allocations.get(allocation.paymentIntentId) || 0) + Number(allocation.amountMinor || 0));
      }
      if (!allocations.size && order.stripePaymentIntentId) {
        const prior = (order.refunds || []).filter(refund => refund.status === "succeeded")
          .reduce((sum, refund) => sum + Number(refund.amountMinor || Math.round(Number(refund.amount || 0) * 100)), 0);
        allocations.set(order.stripePaymentIntentId, Math.round(Number(order.amountPaid || 0) * 100) + prior);
      }
      for (const [id, allocated] of allocations) {
        if (remaining <= 0) break;
        if (!budgets.has(id)) {
          const intent = await stripe.paymentIntents.retrieve(id);
          if (intent.status !== "succeeded") continue;
          const owner = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
          if (owner !== customer.stripeCustomerId || intent.currency?.toLowerCase() !== "gbp" ||
              !Number.isSafeInteger(intent.amount_received) || intent.amount_received <= 0) {
            throw new Error("The allocated capture does not match this customer and currency. No refund was started.");
          }
          const history = (await listRefunds(id)).filter(refund => !["failed", "canceled"].includes(refund.status));
          const reserved = history.reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
          budgets.set(id, { history, available: Math.max(0, intent.amount_received - reserved) });
        }
        const budget = budgets.get(id);
        const ambiguous = budget.history.filter(refund => !refund.metadata?.orderId &&
          !(order.refunds || []).some(local => local.stripeRefundId === refund.id));
        if (ambiguous.length && await Order.countDocuments({ subscription: subscription._id,
          $or: [{ stripePaymentIntentId: id }, { "paymentAllocations.paymentIntentId": id }] }) > 1) {
          throw new Error("A shared payment has an unattributed refund; support reconciliation is required.");
        }
        const returned = budget.history.filter(refund => refund.metadata?.orderId === String(order._id) ||
          (order.refunds || []).some(local => local.stripeRefundId === refund.id))
          .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
        const amount = Math.min(remaining, Math.max(0, allocated - returned), budget.available);
        if (!amount) continue;
        const stepKey = `subscription:${subscription._id}:mutation:${operationId}:decrease:order:${order._id}:payment:${id}`;
        steps.push({ orderId: String(order._id), amountMinor: amount,
          idempotencyKey: `${stepKey}:refund`, params: { payment_intent: id, amount,
            metadata: { subscriptionId: String(subscription._id), subscriptionNumber: subscription.subscriptionNumber,
              orderId: String(order._id), type: "subscription_decrease_refund", refundStepKey: stepKey } } });
        budget.available -= amount;
        remaining -= amount;
      }
      if (remaining > 0) throw new Error("Insufficient allocated captured payment to refund this delivery. No new refund was started.");
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
