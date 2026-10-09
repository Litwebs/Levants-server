"use strict";
const crypto = require("crypto");
const mongoose = require("mongoose");
const Mutation = require("../../models/subscriptionMutation.model");
const Delivery = require("../../models/subscriptionDelivery.model");
const Payment = require("../../models/payment.model");
const stripe = require("../../utils/stripe.util");
const storeCredit = require("../storeCredit.service");
const { listRefunds } = require("./subscriptionRefundSettlement.service");
const idOf = value => typeof value === "string" ? value : value?.id;

// Call while owning the subscription mutation lock. Linked add-ons settle with
// their order; only paid products with no generated order are handled here.
async function settleDetachedAddOns({ subscription, deliveries, refundMethod, operationId }) {
  const totals = { refundedMinor: 0, creditedMinor: 0 };
  for (const delivery of deliveries) {
    if (delivery.order) continue;
    for (const addOn of delivery.addOns || []) {
      const mutation = await Mutation.findOne({ subscription: subscription._id,
        customer: subscription.customer, operationId: addOn.operationId });
      const snapshot = mutation?.addOnSnapshot;
      if (!snapshot || snapshot.deliveryId !== String(delivery._id) ||
          snapshot.amountMinor !== addOn.amountMinor ||
          snapshot.paymentIntent?.id !== addOn.stripePaymentIntentId) {
        throw new Error("This paid add-on needs support reconciliation before its delivery can change.");
      }
      const intent = await stripe.paymentIntents.retrieve(addOn.stripePaymentIntentId);
      if (intent.status !== "succeeded" || idOf(intent.customer) !== snapshot.chargeParams.customer ||
          intent.currency !== snapshot.chargeParams.currency || intent.amount_received !== snapshot.amountMinor) {
        throw new Error("The add-on payment does not match its saved purchase; reconciliation is required.");
      }
      let plan = snapshot.settlement;
      if (!plan) {
        const history = await listRefunds(intent.id);
        if (history.some(refund => !["failed", "canceled"].includes(refund.status))) {
          throw new Error("The add-on has an external refund; reconciliation is required before returning more value.");
        }
        const stepKey = crypto.createHash("sha256").update(`${mutation._id}:${intent.id}:detached`).digest("hex");
        plan = { kind: refundMethod, amountMinor: snapshot.amountMinor, startedAt: new Date(), operationId: operationId || null,
          idempotencyKey: `subscription-detached-add-on:${stepKey}`,
          params: { payment_intent: intent.id, amount: snapshot.amountMinor, metadata: {
            subscriptionId: String(subscription._id), operationId: mutation.operationId,
            type: "subscription_detached_add_on_refund", refundStepKey: stepKey,
          } } };
        const saved = await Mutation.updateOne({ _id: mutation._id, "addOnSnapshot.settlement": null },
          { $set: { "addOnSnapshot.settlement": plan } });
        if (!saved.matchedCount) throw new Error("The add-on settlement plan could not be saved. Retry the original change.");
      }
      if (plan.kind !== refundMethod) {
        throw new Error("An add-on settlement is unfinished. Retry with its original refund method.");
      }
      if (plan.kind === "credit") {
        const credit = await storeCredit.addCredit({ customerId: subscription.customer,
          amountMinor: plan.amountMinor, type: "subscription_refund",
          reason: `Paid add-on delivery removed on ${subscription.subscriptionNumber}`,
          subscriptionId: subscription._id, idempotencyKey: plan.idempotencyKey });
        if (!credit.ok) throw new Error(credit.message);
      } else {
        let refund = plan.refund?.id ? await stripe.refunds.retrieve(plan.refund.id) : null;
        if (!refund && Date.now() - new Date(plan.startedAt).getTime() >= 23 * 3600000) {
          const matches = (await listRefunds(intent.id)).filter(candidate =>
            candidate.metadata?.refundStepKey === plan.params.metadata.refundStepKey);
          if (matches.length !== 1 || matches[0].amount !== plan.amountMinor) {
            throw new Error("This aged add-on refund needs support reconciliation; another refund will not be created.");
          }
          refund = matches[0];
        }
        if (!refund) refund = await stripe.refunds.create(plan.params, { idempotencyKey: plan.idempotencyKey });
        const recorded = await Mutation.updateOne({ _id: mutation._id },
          { $set: { "addOnSnapshot.settlement.refund": refund } });
        if (!recorded.matchedCount) throw new Error("The add-on refund checkpoint could not be saved.");
        if (refund.status !== "succeeded" || refund.amount !== plan.amountMinor ||
            (refund.payment_intent && idOf(refund.payment_intent) !== intent.id)) {
          throw new Error("The add-on refund is not yet confirmed. Retry the original refund method.");
        }
      }
      await mongoose.connection.transaction(async session => {
        const removed = await Delivery.updateOne({ _id: delivery._id, subscription: subscription._id,
          order: null, "addOns.operationId": mutation.operationId },
        { $pull: { addOns: { operationId: mutation.operationId } } }, { session });
        if (!removed.matchedCount) throw new Error("The paid add-on target changed before settlement could commit.");
        const ledger = await Payment.updateOne({ subscription: subscription._id, providerReference: intent.id },
          { $set: { status: "refunded", refundedAt: new Date() } }, { session });
        if (!ledger.matchedCount) throw new Error("The paid add-on ledger is missing; reconciliation is required.");
        const completed = await Mutation.updateOne({ _id: mutation._id },
          { $set: { "addOnSnapshot.settlement.completedAt": new Date() } }, { session });
        if (!completed.matchedCount) throw new Error("The add-on settlement completion could not be saved.");
      });
      totals[plan.kind === "credit" ? "creditedMinor" : "refundedMinor"] += plan.amountMinor;
    }
  }
  return totals;
}
module.exports = { settleDetachedAddOns };
