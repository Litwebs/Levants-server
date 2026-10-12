"use strict";
// Revenue is retained order payment, after successful card/store-credit
// settlements. Subscription amountPaid is already net; ordinary orders keep
// it gross. Match captured/settling states without inventing unpaid revenue.
const REVENUE_ORDER_MATCH = { status: { $in: ["paid", "partially_paid", "partially_refunded", "refund_pending", "refund_failed"] } };
const currencyFactor = { $switch: { branches: [
  { case: { $in: [{ $toUpper: { $ifNull: ["$currency", "GBP"] } }, ["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]] }, then: 1 },
  { case: { $in: [{ $toUpper: { $ifNull: ["$currency", "GBP"] } }, ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]] }, then: 1000 },
], default: 100 } };
const NET_REVENUE_EXPRESSION = { $let: { vars: { factor: currencyFactor }, in: {
  $let: { vars: {
    paid: { $round: [{ $multiply: [{ $ifNull: ["$amountPaid", "$total"] }, "$$factor"] }, 0] },
    allocated: { $sum: { $map: { input: { $ifNull: ["$paymentAllocations", []] }, as: "a", in: "$$a.amountMinor" } } },
    refunds: { $reduce: { input: { $ifNull: ["$refunds", []] }, initialValue: { amount: 0, ids: [] }, in: {
      $cond: [{ $and: [ { $eq: ["$$this.status", "succeeded"] },
        { $not: [{ $and: [{ $ne: [{ $ifNull: ["$$this.stripeRefundId", null] }, null] }, { $in: ["$$this.stripeRefundId", "$$value.ids"] }] }] },
      ] }, { amount: { $add: ["$$value.amount", { $ifNull: ["$$this.amountMinor", { $round: [{ $multiply: [{ $ifNull: ["$$this.amount", 0] }, "$$factor"] }, 0] }] }] },
        ids: { $concatArrays: ["$$value.ids", [{ $ifNull: ["$$this.stripeRefundId", null] }]] } }, "$$value" ],
    } } },
  }, in: { $divide: [{ $max: [0, { $cond: [
    { $eq: ["$orderType", "subscription_generated"] },
    { $min: ["$$paid", { $subtract: [{ $cond: [{ $gt: ["$$allocated", 0] }, "$$allocated", { $add: ["$$paid", "$$refunds.amount"] }] }, "$$refunds.amount"] }] },
    { $subtract: ["$$paid", "$$refunds.amount"] },
  ] }] }, "$$factor"] } },
} } };
module.exports = { REVENUE_ORDER_MATCH, NET_REVENUE_EXPRESSION };
