const { buildCreatedAtMatch } = require("./analyticsDate.util");

const ACTIVE_ORDER_MATCH = {
  archived: { $ne: true },
};

const ANALYTICS_ORDER_STATUSES = [
  "pending",
  "unpaid",
  "paid",
  "partially_paid",
  "failed",
  "cancelled",
  "refund_pending",
  "partially_refunded",
  "refunded",
  "refund_failed",
];

const PAID_ORDER_MATCH = {
  status: "paid",
};

/**
 * Mutually exclusive source classification.
 *
 * Precedence:
 *   1. Imported/manual orders
 *   2. Subscription-generated orders
 *   3. Website one-time orders
 *
 * This mirrors the admin Orders semantics and prevents subscription deliveries
 * from leaking into the Website analytics bucket.
 */
const buildOrderSourceMatch = (orderSource) => {
  const normalized =
    typeof orderSource === "string" ? orderSource.trim().toLowerCase() : "";

  if (normalized === "imported") {
    return { "metadata.manualImport": true };
  }

  if (normalized === "subscription") {
    return {
      "metadata.manualImport": { $ne: true },
      $or: [
        { orderType: "subscription_generated" },
        { subscription: { $ne: null } },
      ],
    };
  }

  if (normalized === "website") {
    return {
      "metadata.manualImport": { $ne: true },
      orderType: { $ne: "subscription_generated" },
      subscription: null,
    };
  }

  return {};
};

const buildOrderMatch = ({
  range,
  from,
  to,
  orderSource,
  timeZone,
  now,
} = {}) => ({
  ...ACTIVE_ORDER_MATCH,
  ...buildCreatedAtMatch({ range, from, to, timeZone, now }),
  ...buildOrderSourceMatch(orderSource),
});

module.exports = {
  ACTIVE_ORDER_MATCH,
  ANALYTICS_ORDER_STATUSES,
  PAID_ORDER_MATCH,
  buildOrderSourceMatch,
  buildOrderMatch,
};
