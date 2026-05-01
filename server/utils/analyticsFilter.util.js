const { buildCreatedAtMatch } = require("./analyticsDate.util");

const ACTIVE_ORDER_MATCH = {
  archived: { $ne: true },
};

const ANALYTICS_ORDER_STATUSES = [
  "pending",
  "unpaid",
  "paid",
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

const buildOrderSourceMatch = (orderSource) => {
  const normalized =
    typeof orderSource === "string" ? orderSource.trim().toLowerCase() : "";

  if (normalized === "imported") {
    return { "metadata.manualImport": true };
  }

  if (normalized === "website") {
    return { "metadata.manualImport": { $ne: true } };
  }

  return {};
};

const buildOrderMatch = ({ range, from, to, orderSource } = {}) => ({
  ...ACTIVE_ORDER_MATCH,
  ...buildCreatedAtMatch({ range, from, to }),
  ...buildOrderSourceMatch(orderSource),
});

module.exports = {
  ACTIVE_ORDER_MATCH,
  ANALYTICS_ORDER_STATUSES,
  PAID_ORDER_MATCH,
  buildOrderSourceMatch,
  buildOrderMatch,
};
