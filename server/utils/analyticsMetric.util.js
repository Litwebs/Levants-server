"use strict";

const {
  DEFAULT_ANALYTICS_TIME_ZONE,
  parseDateRange,
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

const ZERO_DECIMAL_CURRENCIES = [
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
];

const SALES_CHANNELS = ["website", "subscription", "imported"];

const SALES_CHANNEL_EXPRESSION = {
  $switch: {
    branches: [
      {
        case: { $eq: ["$metadata.manualImport", true] },
        then: "imported",
      },
      {
        case: {
          $or: [
            { $eq: ["$orderType", "subscription_generated"] },
            { $ne: [{ $ifNull: ["$subscription", null] }, null] },
          ],
        },
        then: "subscription",
      },
    ],
    default: "website",
  },
};

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
      $cond: [
        {
          $in: [
            {
              $toUpper: {
                $ifNull: ["$refunds.currency", { $ifNull: ["$currency", "GBP"] }],
              },
            },
            ZERO_DECIMAL_CURRENCIES,
          ],
        },
        { $ifNull: ["$refunds.amountMinor", 0] },
        {
          $divide: [{ $ifNull: ["$refunds.amountMinor", 0] }, 100],
        },
      ],
    },
  ],
};

const compactAnd = (...parts) => {
  const clauses = parts.filter(
    (part) => part && typeof part === "object" && Object.keys(part).length > 0,
  );

  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
};

const buildSalesOrderMatch = ({
  range,
  from,
  to,
  orderSource,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
  now,
} = {}) =>
  compactAnd(
    ACTIVE_ORDER_MATCH,
    buildOrderSourceMatch(orderSource),
    { status: { $in: COLLECTED_ORDER_STATUSES } },
    buildEventDateMatch({
      range,
      from,
      to,
      field: "paidAt",
      fallbackField: "createdAt",
      timeZone,
      now,
    }),
  );

const buildRefundLedgerPrefilter = ({
  range,
  from,
  to,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
  now,
} = {}) => {
  const parsed = parseDateRange({ range, from, to, timeZone, now });

  if (parsed.invalid) {
    return { _id: { $exists: false } };
  }

  const succeededRefund = { status: "succeeded" };
  if (!parsed.start && !parsed.end) {
    return { refunds: { $elemMatch: succeededRefund } };
  }

  const dateRange = {};
  if (parsed.start) dateRange.$gte = parsed.start;
  if (parsed.end) dateRange.$lte = parsed.end;

  return {
    refunds: {
      $elemMatch: {
        status: "succeeded",
        $or: [
          { refundedAt: dateRange },
          { refundedAt: null, createdAt: dateRange },
        ],
      },
    },
  };
};

const buildRefundEventMatch = ({
  range,
  from,
  to,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
  now,
} = {}) =>
  compactAnd(
    { "refunds.status": "succeeded" },
    buildEventDateMatch({
      range,
      from,
      to,
      field: "refunds.refundedAt",
      fallbackField: "refunds.createdAt",
      timeZone,
      now,
    }),
  );

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
  ZERO_DECIMAL_CURRENCIES,
  SALES_CHANNELS,
  SALES_CHANNEL_EXPRESSION,
  EFFECTIVE_PAID_AT_EXPRESSION,
  COLLECTED_AMOUNT_EXPRESSION,
  REFUND_AMOUNT_EXPRESSION,
  buildSalesOrderMatch,
  buildRefundLedgerPrefilter,
  buildRefundEventMatch,
  buildLegacyRefundEventMatch,
};
