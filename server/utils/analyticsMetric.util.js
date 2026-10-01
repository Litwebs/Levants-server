"use strict";

const {
  DEFAULT_ANALYTICS_TIME_ZONE,
  buildEventDateMatch,
} = require("./analyticsDate.util");
const {
  ACTIVE_ORDER_MATCH,
  buildOrderSourceMatch,
} = require("./analyticsFilter.util");

const COLLECTED_ORDER_STATUSES = [
  "paid",
  "partially_paid",
  "refund_pending",
  "partially_refunded",
  "refunded",
  "refund_failed",
];

const EFFECTIVE_PAID_AT_EXPRESSION = {
  $ifNull: ["$paidAt", "$createdAt"],
};

const COLLECTED_AMOUNT_EXPRESSION = {
  $cond: [
    { $eq: ["$status", "partially_paid"] },
    { $ifNull: ["$amountPaid", 0] },
    { $ifNull: ["$total", 0] },
  ],
};

const REFUND_AMOUNT_EXPRESSION = {
  $ifNull: [
    "$refunds.amount",
    {
      $divide: [{ $ifNull: ["$refunds.amountMinor", 0] }, 100],
    },
  ],
};

const buildSalesOrderMatch = ({
  range,
  from,
  to,
  orderSource,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
  now,
} = {}) => ({
  ...ACTIVE_ORDER_MATCH,
  ...buildOrderSourceMatch(orderSource),
  status: { $in: COLLECTED_ORDER_STATUSES },
  ...buildEventDateMatch({
    range,
    from,
    to,
    field: "paidAt",
    fallbackField: "createdAt",
    timeZone,
    now,
  }),
});

const buildRefundEventMatch = ({
  range,
  from,
  to,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
  now,
} = {}) => ({
  "refunds.status": "succeeded",
  ...buildEventDateMatch({
    range,
    from,
    to,
    field: "refunds.refundedAt",
    fallbackField: "refunds.createdAt",
    timeZone,
    now,
  }),
});

const buildLegacyRefundEventMatch = ({
  range,
  from,
  to,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
  now,
} = {}) =>
  buildEventDateMatch({
    range,
    from,
    to,
    field: "refund.refundedAt",
    timeZone,
    now,
  });

module.exports = {
  COLLECTED_ORDER_STATUSES,
  EFFECTIVE_PAID_AT_EXPRESSION,
  COLLECTED_AMOUNT_EXPRESSION,
  REFUND_AMOUNT_EXPRESSION,
  buildSalesOrderMatch,
  buildRefundEventMatch,
  buildLegacyRefundEventMatch,
};
