"use strict";
const Mutation = require("../../models/subscriptionMutation.model");
const Plan = require("../../models/subscriptionInvoiceFulfillment.model");
const Customer = require("../../models/customer.model");
const Subscription = require("../../models/subscription.model");
const Reservation = require("../../models/subscriptionStockReservation.model");
const logger = require("../../utils/logger.util");

async function auditUnresolvedSubscriptionOperations({ now = Date.now() } = {}) {
  const stale = new Date(now - 120000);
  const [mutations, invoices, cards, resumes, inventory] = await Promise.all([
    Mutation.find({ status: { $ne: "completed" }, updatedAt: { $lte: stale }, $or: [
      { creationSnapshot: { $ne: null }, "creationSnapshot.declined": { $ne: true } },
      { itemIncreaseSnapshot: { $ne: null } }, { decreaseRefundSnapshot: { $ne: null } },
      { addOnSnapshot: { $ne: null }, "addOnSnapshot.paymentIntent.status": { $ne: "requires_payment_method" } },
    ] }).select("_id operationId mutationType").lean(),
    Plan.find({ $or: [{ legacyReviewRequired: true }, { inventoryBlocked: true },
      { completedAt: null, createdAt: { $lte: new Date(now - 7200000) } }] })
      .select("_id invoiceId subscription legacyReviewRequired inventoryBlocked").lean(),
    Customer.find({ paymentMethodOperation: { $ne: null }, updatedAt: { $lte: stale } })
      .select("_id").lean(),
    Subscription.find({ "resumePaymentPlan.id": { $exists: true }, "resumePaymentPlan.completedAt": null,
      "resumePaymentPlan.startedAt": { $lte: stale } }).select("_id subscriptionNumber").lean(),
    Reservation.find({ state: "held", createdAt: { $lte: new Date(now - 23 * 3600000) } })
      .select("key subscription").lean(),
  ]);
  const report = { mutations, invoices, customersWithCardRecovery: cards, resumes, agedInventoryHolds: inventory };
  const count = Object.values(report).reduce((sum, entries) => sum + entries.length, 0);
  if (count) logger.error("[SubscriptionRecovery] Unresolved operations require review with the recovery command", report);
  return { count, ...report };
}
module.exports = { auditUnresolvedSubscriptionOperations };
