"use strict";

const crypto = require("crypto");
const Order = require("../../models/order.model");
const stripe = require("../../utils/stripe.util");

async function listRefunds(paymentIntentId) {
  const refunds = [];
  let cursor;
  do {
    const page = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100,
      ...(cursor ? { starting_after: cursor } : {}) });
    refunds.push(...page.data);
    if (!page.has_more) break;
    const next = page.data.at(-1)?.id;
    if (!next || next === cursor) throw new Error("Refund history pagination did not advance");
    cursor = next;
  } while (true);
  return refunds;
}

async function hasUnfinishedCardRefund(subscriptionId, eligibleOrderIds) {
  return Boolean(await Order.exists({ subscription: subscriptionId,
    subscriptionRefundPlan: { $ne: null },
    $or: [
      { status: { $ne: "refunded" } },
      { "subscriptionRefundPlan.steps": { $elemMatch: { "refund.status": { $ne: "succeeded" } } } },
    ],
    ...(eligibleOrderIds ? { _id: { $nin: eligibleOrderIds } } : {}),
  }));
}

function refundFailure(error) {
  const refundedMinor = Number(error.confirmedRefundedMinor || 0);
  if (!error.refundPlanSaved) {
    return { success: false, message: "We couldn't prepare the card refund. No new refund was started; please try again or contact support.", data: null };
  }
  return {
    success: false,
    message: `The card refund is incomplete (£${(refundedMinor / 100).toFixed(2)} confirmed returned). Retry the card refund to finish it. Store credit is blocked while this refund needs reconciliation.`,
    data: { refundPending: true, refundedMinor, remainingMinor: error.remainingMinor ?? null },
  };
}

async function refundAcrossSubscriptionPayments(subscription, customer, primaryId, amountMinor, metadataType, operationKey, orderId) {
  const filter = { _id: orderId, subscription: subscription._id, customer: customer._id };
  let order = await Order.findOne(filter).select("+subscriptionRefundPlan paymentAllocations refunds amountPaid stripePaymentIntentId").lean();
  if (!order) throw new Error("Refund delivery order not found");
  let plan = order.subscriptionRefundPlan;
  let confirmedMinor = 0;
  try {
    if (!plan) {
      // Only payment intents actually allocated to this order may fund its refund.
      // Retrieve directly: old payments must not disappear beyond a customer-list page.
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Invalid refund amount");
      const allocations = new Map();
      for (const allocation of order.paymentAllocations || []) {
        if (!allocation.paymentIntentId || !Number.isSafeInteger(allocation.amountMinor) || allocation.amountMinor < 0) {
          throw new Error("Refund allocation needs reconciliation");
        }
        const total = (allocations.get(allocation.paymentIntentId) || 0) + allocation.amountMinor;
        if (!Number.isSafeInteger(total)) throw new Error("Refund allocation needs reconciliation");
        allocations.set(allocation.paymentIntentId, total);
      }
      // Legacy orders can lack the base allocation, including when an add-on
      // later introduced a partial ledger. Infer it only for an independently
      // owned capture, never for a shared invoice or from Stripe's whole balance.
      if (primaryId && primaryId === order.stripePaymentIntentId && !allocations.has(primaryId)) {
        const paidMinor = Math.round(Number(order.amountPaid) * 100);
        const otherMinor = [...allocations.values()].reduce((sum, minor) => sum + minor, 0);
        const priorMinor = (order.refunds || []).filter(refund => refund.status === "succeeded")
          .reduce((sum, refund) => sum + Number(refund.amountMinor ?? Math.round(Number(refund.amount) * 100)), 0);
        const basis = paidMinor + priorMinor - otherMinor;
        if (!Number.isSafeInteger(basis) || basis <= 0 || await Order.countDocuments({
          customer: customer._id,
          $or: [{ stripePaymentIntentId: primaryId }, { "paymentAllocations.paymentIntentId": primaryId }],
        }) !== 1) throw new Error("Legacy refund allocation needs reconciliation");
        allocations.set(primaryId, basis);
      }
      // A primary invoice alone is not evidence of a delivery's ownership.
      const intentIds = [...allocations.keys()].sort((a, b) => a === primaryId ? -1 : b === primaryId ? 1 : 0);
      const steps = [];
      let remaining = amountMinor;
      for (const id of intentIds) {
        if (remaining <= 0) break;
        const intent = await stripe.paymentIntents.retrieve(id);
        if (intent.status !== "succeeded") continue;
        const intentCustomer = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
        if (intentCustomer && intentCustomer !== customer.stripeCustomerId) throw new Error("Refund payment owner mismatch");
        const history = (await listRefunds(id)).filter(refund => !["failed", "canceled"].includes(refund.status));
        const local = (order.refunds || []).filter(refund => refund.paymentIntentId === id &&
          !["failed", "canceled"].includes(refund.status));
        const localIds = new Set(local.map(refund => refund.stripeRefundId).filter(Boolean));
        const ambiguous = history.some(refund => !refund.metadata?.orderId && !localIds.has(refund.id));
        if (ambiguous && await Order.countDocuments({ subscription: subscription._id,
          $or: [{ stripePaymentIntentId: id }, { "paymentAllocations.paymentIntentId": id }] }) !== 1) {
          throw new Error("A shared payment has an unattributed refund; support reconciliation is required");
        }
        const returned = new Map();
        for (const refund of local) {
          const minor = refund.amountMinor ?? Math.round(Number(refund.amount) * 100);
          if (!refund.stripeRefundId || !Number.isSafeInteger(minor) || minor < 0) throw new Error("Refund ledger needs reconciliation");
          returned.set(refund.stripeRefundId, minor);
        }
        for (const refund of history) {
          if (refund.metadata?.orderId === String(orderId) || localIds.has(refund.id) || (ambiguous && !refund.metadata?.orderId)) {
            returned.set(refund.id, refund.amount);
          }
        }
        const returnedMinor = [...returned.values()].reduce((sum, minor) => {
          if (!Number.isSafeInteger(minor) || minor < 0 || !Number.isSafeInteger(sum + minor)) throw new Error("Refund ledger needs reconciliation");
          return sum + minor;
        }, 0);
        const reserved = history
          .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
        const available = Math.max(0, Number(intent.amount_received ?? intent.amount ?? 0) - reserved);
        const amount = Math.min(remaining, available, Math.max(0, allocations.get(id) - returnedMinor));
        if (!amount) continue;
        const stepKey = crypto.createHash("sha256").update(`${operationKey}:${orderId}:${id}`).digest("hex");
        steps.push({ idempotencyKey: `subscription-refund:${stepKey}`,
          params: { payment_intent: id, amount, metadata: {
            subscriptionId: String(subscription._id), subscriptionNumber: subscription.subscriptionNumber,
            type: metadataType, orderId: String(orderId), refundStepKey: stepKey,
          } },
        });
        remaining -= amount;
      }
      if (remaining > 0) throw new Error("Insufficient captured payment balance to refund");
      // Do not start any refund until the complete immutable plan is durable.
      const proposed = { amountMinor, operationKey, createdAt: new Date(), steps };
      order = await Order.findOneAndUpdate({ ...filter, subscriptionRefundPlan: null },
        { $set: { subscriptionRefundPlan: proposed } }, { new: true })
        .select("+subscriptionRefundPlan").lean();
      if (!order) order = await Order.findOne(filter).select("+subscriptionRefundPlan").lean();
      plan = order?.subscriptionRefundPlan;
      if (!plan) throw new Error("Refund plan could not be saved");
    }

    confirmedMinor = plan.steps.filter(step => step.refund?.status === "succeeded")
      .reduce((sum, step) => sum + step.params.amount, 0);
    const completed = [];
    for (let index = 0; index < plan.steps.length; index += 1) {
      const step = plan.steps[index];
      let refund = step.refund;
      const alreadyConfirmed = refund?.status === "succeeded";
      if (refund && !alreadyConfirmed) {
        refund = await stripe.refunds.retrieve(refund.id);
      }
      if (!refund) {
        if (step.startedAt && Date.now() - new Date(step.startedAt).getTime() >= 23 * 3600000) {
          // Recover an accepted refund by its frozen metadata after Stripe may
          // have expired the key. Never blindly create an aged ambiguous refund.
          const matches = (await listRefunds(step.params.payment_intent))
            .filter(candidate => candidate.metadata?.refundStepKey === step.params.metadata.refundStepKey);
          if (matches.length !== 1 || matches[0].amount !== step.params.amount) {
            throw new Error("Expired refund attempt needs reconciliation");
          }
          refund = matches[0];
        } else {
          if (!step.startedAt) {
            step.startedAt = new Date();
            const started = await Order.updateOne(filter, { $set: { [`subscriptionRefundPlan.steps.${index}.startedAt`]: step.startedAt } });
            if (!started.matchedCount) throw new Error("Refund attempt could not be saved");
          }
          refund = await stripe.refunds.create(step.params, { idempotencyKey: step.idempotencyKey });
        }
      }
      if (refund.status === "succeeded" && !alreadyConfirmed) confirmedMinor += step.params.amount;
      const historyEntry = {
        stripeRefundId: refund.id, paymentIntentId: step.params.payment_intent,
        currency: refund.currency || "gbp", amountMinor: step.params.amount, amount: step.params.amount / 100,
        status: refund.status === "succeeded" ? "succeeded" : ["failed", "canceled"].includes(refund.status) ? "failed" : "pending",
        refundedAt: refund.status === "succeeded" ? new Date() : undefined,
        restock: false,
      };
      // The remote checkpoint and order refund ledger move together. This also
      // survives a webhook recording the refund before this request returns.
      const saved = await Order.updateOne({ ...filter, "refunds.stripeRefundId": { $ne: refund.id } }, {
        $set: { [`subscriptionRefundPlan.steps.${index}.refund`]: refund }, $push: { refunds: historyEntry },
      });
      if (!saved.matchedCount) {
        const updated = await Order.updateOne({ ...filter, "refunds.stripeRefundId": refund.id }, {
          $set: { [`subscriptionRefundPlan.steps.${index}.refund`]: refund,
            "refunds.$[entry].status": historyEntry.status },
        }, { arrayFilters: [{ "entry.stripeRefundId": refund.id }] });
        if (!updated.matchedCount) throw new Error("Refund checkpoint could not be saved");
      }
      step.refund = refund;
      if (refund.status !== "succeeded") throw new Error("Card refund is not confirmed successful");
      completed.push(refund);
    }
    return completed;
  } catch (error) {
    error.refundPlanSaved = Boolean(plan);
    error.confirmedRefundedMinor = confirmedMinor;
    error.remainingMinor = Math.max(0, Number(plan?.amountMinor ?? amountMinor) - confirmedMinor);
    throw error;
  }
}

module.exports = { refundAcrossSubscriptionPayments, hasUnfinishedCardRefund, refundFailure, listRefunds };
