"use strict";

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
  const visibleWebsiteStatuses = requestedStatuses.filter(
    (status) => status !== "pending" && status !== "unpaid",
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
        $in: visibleWebsiteStatuses,
      },
      "metadata.manualImport": { $ne: true },
      orderType: { $ne: "subscription_generated" },
      subscription: null,
    };
  }

  if (normalizedOrderSource === "subscription") {
    return {
      $and: [
        buildPaymentVisibilityQuery({ requestedStatuses }),
        {
          $or: [
            { orderType: "subscription_generated" },
            { subscription: { $ne: null } },
          ],
        },
      ],
    };
  }

  return {
    $or: [
      {
        status: { $in: requestedStatuses },
        "metadata.manualImport": true,
      },
      {
        status: { $in: visibleWebsiteStatuses },
        "metadata.manualImport": { $ne: true },
      },
    ],
  };
}

module.exports = {
  ACTIVE_ORDER_FILTER,
  buildActiveOrderIdQuery,
  buildPaymentVisibilityQuery,
};
