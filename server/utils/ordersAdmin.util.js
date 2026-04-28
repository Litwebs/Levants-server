"use strict";

const VISIBLE_WEBSITE_PAYMENT_STATUSES = new Set([
  "paid",
  "refund_pending",
  "partially_refunded",
  "refunded",
]);

const ACTIVE_ORDER_FILTER = {
  archived: { $ne: true },
};

function buildActiveOrderIdQuery(orderId) {
  return {
    _id: orderId,
    ...ACTIVE_ORDER_FILTER,
  };
}

function buildPaymentVisibilityQuery({
  requestedStatuses,
  normalizedOrderSource,
} = {}) {
  const websiteStatuses = requestedStatuses.filter((status) =>
    VISIBLE_WEBSITE_PAYMENT_STATUSES.has(status),
  );

  if (normalizedOrderSource === "imported") {
    return {
      status: {
        $in: requestedStatuses,
      },
      "metadata.manualImport": true,
    };
  }

  if (normalizedOrderSource === "website") {
    return {
      status: {
        $in: websiteStatuses,
      },
      "metadata.manualImport": { $ne: true },
    };
  }

  return {
    $or: [
      {
        status: { $in: requestedStatuses },
        "metadata.manualImport": true,
      },
      {
        status: { $in: websiteStatuses },
        "metadata.manualImport": { $ne: true },
      },
    ],
  };
}

module.exports = {
  VISIBLE_WEBSITE_PAYMENT_STATUSES,
  ACTIVE_ORDER_FILTER,
  buildActiveOrderIdQuery,
  buildPaymentVisibilityQuery,
};
