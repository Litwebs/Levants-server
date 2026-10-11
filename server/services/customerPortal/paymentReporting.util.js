"use strict";

// Delivery allocations record gross collections. Subscription amountPaid is
// reduced by item settlements; ordinary order amountPaid remains gross.
function summarizeOrderPayment(order = {}) {
  const currency = String(order.currency || "GBP").toUpperCase();
  const factor = 10 ** new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
  const minor = value => Math.max(0, Math.round(Number(value || 0) * factor));
  const finiteMinor = value => Math.max(0, Math.round(Number(value || 0)));
  const seen = new Set();
  const refunds = (order.refunds || []).filter(entry => {
    if (entry.status !== "succeeded") return false;
    if (entry.stripeRefundId && seen.has(entry.stripeRefundId)) return false;
    if (entry.stripeRefundId) seen.add(entry.stripeRefundId);
    return true;
  });
  let refundMinor = refunds.reduce((sum, entry) => sum +
    (entry.amountMinor != null ? finiteMinor(entry.amountMinor) : minor(entry.amount)), 0);
  const allocatedMinor = (order.paymentAllocations || []).reduce((sum, entry) =>
    sum + finiteMinor(entry.amountMinor), 0);
  const subscription = order.orderType === "subscription_generated";
  const paidMinor = minor(order.amountPaid ?? order.total);
  const fullReturn = order.status === "refunded";
  const grossMinor = allocatedMinor || (subscription && !fullReturn
    ? paidMinor + refundMinor : Math.max(paidMinor, refundMinor));
  if (fullReturn && !refundMinor && !(order.refunds || []).length && order.refund?.stripeRefundId && order.refund?.refundedAt) {
    refundMinor = grossMinor;
  }
  let remainingMinor = Math.max(0, grossMinor - refundMinor);
  // Partial store-credit settlements reduce subscription amountPaid without
  // adding a card-refund record. A fully settled order can retain amountPaid.
  if (subscription && order.amountPaid != null && !fullReturn) {
    remainingMinor = Math.min(remainingMinor, paidMinor);
  }
  if (fullReturn) remainingMinor = 0;
  const settledMinor = grossMinor - remainingMinor;
  return {
    capturedAmount: grossMinor / factor,
    refundedAmount: Math.min(refundMinor, grossMinor) / factor,
    creditedAmount: Math.max(0, settledMinor - refundMinor) / factor,
    netAmount: remainingMinor / factor,
    settledAmount: settledMinor / factor,
  };
}

module.exports = { summarizeOrderPayment };
