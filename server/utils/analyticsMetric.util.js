"use strict";

const {
  DEFAULT_ANALYTICS_TIME_ZONE,
  parseDateRange,
  buildEventDateMatch,
} = require("./analyticsDate.util");
const { NET_REVENUE_EXPRESSION } = require("./analyticsNetRevenue.util");
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

// Subscription settlement stores amountPaid net of successful refunds. Preserve
// event-based analytics by recovering the collected gross amount at the sale,
// then counting each successful refund once at its own event date.
const UNIQUE_SUCCESSFUL_REFUNDS_EXPRESSION = {
  $let: {
    vars: {
      unique: {
        $reduce: {
          input: { $ifNull: ["$refunds", []] },
          initialValue: { ids: [], items: [] },
          in: {
            $cond: [
              { $and: [
                { $eq: ["$$this.status", "succeeded"] },
                { $or: [
                  { $eq: [{ $ifNull: ["$$this.stripeRefundId", null] }, null] },
                  { $not: [{ $in: ["$$this.stripeRefundId", "$$value.ids"] }] },
                ] },
              ] },
              {
                ids: { $concatArrays: ["$$value.ids", [{ $ifNull: ["$$this.stripeRefundId", null] }]] },
                items: { $concatArrays: ["$$value.items", ["$$this"]] },
              },
              "$$value",
            ],
          },
        },
      },
    },
    in: "$$unique.items",
  },
};

const refundAmountExpression = (field) => ({
  $let: {
    vars: {
      factor: { $switch: {
        branches: [
          { case: { $in: [{ $toUpper: { $ifNull: [field + ".currency", { $ifNull: ["$currency", "GBP"] }] } }, ZERO_DECIMAL_CURRENCIES] }, then: 1 },
          { case: { $in: [{ $toUpper: { $ifNull: [field + ".currency", { $ifNull: ["$currency", "GBP"] }] } }, ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]] }, then: 1000 },
        ],
        default: 100,
      } },
    },
    in: { $cond: [
      { $ne: [{ $ifNull: [field + ".amountMinor", null] }, null] },
      { $divide: [field + ".amountMinor", "$$factor"] },
      { $ifNull: [field + ".amount", 0] },
    ] },
  },
});

const SUCCESSFUL_REFUND_TOTAL_EXPRESSION = {
  $sum: { $map: {
    input: UNIQUE_SUCCESSFUL_REFUNDS_EXPRESSION,
    as: "refund",
    in: refundAmountExpression("$$refund"),
  } },
};

const RECORDED_PAID_AMOUNT_EXPRESSION = {
  $cond: [
    { $ne: [{ $ifNull: ["$amountPaid", null] }, null] },
    { $ifNull: ["$amountPaid", 0] },
    {
      $cond: [
        { $eq: ["$status", "partially_paid"] },
        0,
        { $ifNull: ["$total", 0] },
      ],
    },
  ],
};

const COLLECTED_AMOUNT_EXPRESSION = {
  $let: {
    vars: { paid: RECORDED_PAID_AMOUNT_EXPRESSION, refunded: SUCCESSFUL_REFUND_TOTAL_EXPRESSION },
    in: { $cond: [
      { $and: [
        { $eq: ["$orderType", "subscription_generated"] },
        { $ne: [{ $ifNull: ["$metadata.manualImport", false] }, true] },
        { $ne: [{ $ifNull: ["$amountPaid", null] }, null] },
      ] },
      { $add: [NET_REVENUE_EXPRESSION, "$$refunded"] },
      { $max: ["$$paid", "$$refunded"] },
    ] },
  },
};

const COLLECTED_FRACTION_EXPRESSION = {
  $cond: [
    { $gt: [{ $ifNull: ["$total", 0] }, 0] },
    {
      $min: [
        1,
        {
          $max: [
            0,
            {
              $divide: [
                COLLECTED_AMOUNT_EXPRESSION,
                "$total",
              ],
            },
          ],
        },
      ],
    },
    1,
  ],
};

const COLLECTED_MERCHANDISE_EXPRESSION = {
  $multiply: [
    { $ifNull: ["$subtotal", 0] },
    COLLECTED_FRACTION_EXPRESSION,
  ],
};

const COLLECTED_DELIVERY_EXPRESSION = {
  $multiply: [
    { $ifNull: ["$deliveryFee", 0] },
    COLLECTED_FRACTION_EXPRESSION,
  ],
};

const COLLECTED_DISCOUNT_EXPRESSION = {
  $multiply: [
    { $ifNull: ["$discountAmount", 0] },
    COLLECTED_FRACTION_EXPRESSION,
  ],
};

const REFUND_AMOUNT_EXPRESSION = refundAmountExpression("$refunds");
const DEDUPLICATE_REFUNDS_STAGE = { $set: { refunds: UNIQUE_SUCCESSFUL_REFUNDS_EXPRESSION } };

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
  COLLECTED_FRACTION_EXPRESSION,
  COLLECTED_MERCHANDISE_EXPRESSION,
  COLLECTED_DELIVERY_EXPRESSION,
  COLLECTED_DISCOUNT_EXPRESSION,
  REFUND_AMOUNT_EXPRESSION,
  DEDUPLICATE_REFUNDS_STAGE,
  buildSalesOrderMatch,
  buildRefundLedgerPrefilter,
  buildRefundEventMatch,
  buildLegacyRefundEventMatch,
};
