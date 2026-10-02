const mongoose = require("mongoose");

const Order = require("../models/order.model");
const Product = require("../models/product.model");
const ProductVariant = require("../models/variant.model");
const Subscription = require("../models/subscription.model");
const Review = require("../models/review.model");

const {
  DEFAULT_ANALYTICS_TIME_ZONE,
  parseDateRange,
  buildEventDateMatch,
  buildCreatedAtMatch,
  formatYmdInTimeZone,
} = require("../utils/analyticsDate.util");

const {
  ACTIVE_ORDER_MATCH,
  ANALYTICS_ORDER_STATUSES,
  buildOrderSourceMatch,
  buildOrderMatch,
} = require("../utils/analyticsFilter.util");

const {
  COLLECTED_ORDER_STATUSES,
  SALES_CHANNELS,
  SALES_CHANNEL_EXPRESSION,
  EFFECTIVE_PAID_AT_EXPRESSION,
  COLLECTED_AMOUNT_EXPRESSION,
  COLLECTED_FRACTION_EXPRESSION,
  COLLECTED_MERCHANDISE_EXPRESSION,
  COLLECTED_DELIVERY_EXPRESSION,
  COLLECTED_DISCOUNT_EXPRESSION,
  REFUND_AMOUNT_EXPRESSION,
  buildSalesOrderMatch,
  buildRefundLedgerPrefilter,
  buildRefundEventMatch,
  buildLegacyRefundEventMatch,
} = require("../utils/analyticsMetric.util");

const {
  buildAnalyticsCounts,
  summarizeAnalyticsCounts,
} = require("../utils/analyticsStatus.util");

const {
  STOCK_AVAILABLE_ADD_FIELDS,
  LOW_STOCK_MATCH,
  OUT_OF_STOCK_MATCH,
  STOCK_PRODUCT_LOOKUP,
  STOCK_PRODUCT_UNWIND,
  STOCK_DEDUP_STAGES,
  STOCK_ITEM_PROJECT,
} = require("../utils/analyticsStock.util");

const {
  MAX_REVENUE_SERIES_BUCKETS,
  normalizeRevenueInterval,
  estimateRevenueSeriesBucketCount,
  buildRevenueSeriesStages,
  buildExpectedSeriesLabels,
  fillRevenueSeriesPoints,
  summarizeRevenueSeries,
} = require("../utils/analyticsRevenueSeries.util");

const {
  resolveComparisonPeriods,
  compareMetrics,
} = require("../utils/analyticsComparison.util");

const PERFORMANCE_COMPARISON_METRICS = [
  "grossRevenue",
  "refundAmount",
  "netRevenue",
  "totalOrders",
  "unitsSold",
  "averageOrderValue",
  "averageUnitsPerOrder",
];

const PRODUCT_LINE_REVENUE_EXPRESSION = {
  $let: {
    vars: {
      lineSubtotal: { $ifNull: ["$items.subtotal", 0] },
      orderSubtotal: { $ifNull: ["$subtotal", 0] },
      collectedMerchandise: COLLECTED_MERCHANDISE_EXPRESSION,
      collectedDiscount: COLLECTED_DISCOUNT_EXPRESSION,
    },
    in: {
      $cond: [
        { $gt: ["$$orderSubtotal", 0] },
        {
          $multiply: [
            { $divide: ["$$lineSubtotal", "$$orderSubtotal"] },
            {
              $cond: [
                {
                  $gt: [
                    {
                      $subtract: [
                        "$$collectedMerchandise",
                        "$$collectedDiscount",
                      ],
                    },
                    0,
                  ],
                },
                {
                  $subtract: [
                    "$$collectedMerchandise",
                    "$$collectedDiscount",
                  ],
                },
                0,
              ],
            },
          ],
        },
        0,
      ],
    },
  },
};

const SALES_CHANNEL_LABELS = {
  website: "Website One-Time",
  subscription: "Subscription",
  imported: "Imported",
};

const roundPercentage = (value, total) =>
  total > 0
    ? Math.round(((value / total) * 100 + Number.EPSILON) * 100) / 100
    : 0;

const buildRecurringVsOneTimeData = (salesBreakdown = {}) => {
  const channels = new Map(
    (salesBreakdown.channels || []).map((channel) => [channel.key, channel]),
  );
  const emptyChannel = (key, label) => ({
    key,
    label,
    grossRevenue: 0,
    merchandiseRevenue: 0,
    deliveryRevenue: 0,
    discountAmount: 0,
    refundAmount: 0,
    netRevenue: 0,
    totalOrders: 0,
    unitsSold: 0,
    averageOrderValue: 0,
    averageUnitsPerOrder: 0,
  });
  const normalize = (key, label) => {
    const source = channels.get(key) || emptyChannel(key, label);
    return {
      key,
      label,
      grossRevenue: Number(source.grossRevenue) || 0,
      merchandiseRevenue: Number(source.merchandiseRevenue) || 0,
      deliveryRevenue: Number(source.deliveryRevenue) || 0,
      discountAmount: Number(source.discountAmount) || 0,
      refundAmount: Number(source.refundAmount) || 0,
      netRevenue: Number(source.netRevenue) || 0,
      totalOrders: Number(source.totalOrders) || 0,
      unitsSold: Number(source.unitsSold) || 0,
      averageOrderValue: Number(source.averageOrderValue) || 0,
      averageUnitsPerOrder: Number(source.averageUnitsPerOrder) || 0,
    };
  };

  const oneTime = normalize("website", "Website One-Time");
  const subscription = normalize("subscription", "Subscription");
  const importedExcluded = normalize("imported", "Imported");
  const comparedTotals = {
    grossRevenue: oneTime.grossRevenue + subscription.grossRevenue,
    refundAmount: oneTime.refundAmount + subscription.refundAmount,
    netRevenue: oneTime.netRevenue + subscription.netRevenue,
    totalOrders: oneTime.totalOrders + subscription.totalOrders,
    unitsSold: oneTime.unitsSold + subscription.unitsSold,
  };

  const withShares = (channel) => ({
    ...channel,
    netRevenueSharePercent: roundPercentage(
      channel.netRevenue,
      comparedTotals.netRevenue,
    ),
    orderSharePercent: roundPercentage(
      channel.totalOrders,
      comparedTotals.totalOrders,
    ),
    unitSharePercent: roundPercentage(
      channel.unitsSold,
      comparedTotals.unitsSold,
    ),
  });

  return {
    oneTime: withShares(oneTime),
    subscription: withShares(subscription),
    importedExcluded,
    comparedTotals,
    metricBasis: {
      comparison:
        "Website One-Time and Subscription are compared as mutually exclusive sales channels. Imported/manual orders are shown separately and excluded from the comparison denominator.",
      revenue:
        "Net revenue is collected gross sales in the selected period minus refunds issued in the selected period.",
      classification:
        "Imported/manual classification has precedence over Subscription markers, preventing double counting.",
      source:
        "This comparison always evaluates both Website One-Time and Subscription channels, so the global order-source filter does not alter it.",
    },
  };
};

const buildSubscriptionRevenueData = (salesBreakdown = {}) => {
  const subscription = (salesBreakdown.channels || []).find(
    (channel) => channel.key === "subscription",
  ) || {
    grossRevenue: 0,
    merchandiseRevenue: 0,
    deliveryRevenue: 0,
    discountAmount: 0,
    refundAmount: 0,
    netRevenue: 0,
    totalOrders: 0,
    unitsSold: 0,
  };

  return {
    subscriptionRevenue: Number(subscription.netRevenue) || 0,
    grossRevenue: Number(subscription.grossRevenue) || 0,
    merchandiseRevenue: Number(subscription.merchandiseRevenue) || 0,
    deliveryRevenue: Number(subscription.deliveryRevenue) || 0,
    discountAmount: Number(subscription.discountAmount) || 0,
    refundAmount: Number(subscription.refundAmount) || 0,
    totalOrders: Number(subscription.totalOrders) || 0,
    unitsSold: Number(subscription.unitsSold) || 0,
    metricBasis: {
      subscriptionRevenue:
        "Net collected Subscription-channel revenue in the selected period: collected gross subscription sales minus subscription refunds issued in the period.",
      channel:
        "Uses the existing mutually exclusive sales-channel classifier. Imported/manual orders take precedence and are never counted as Subscription revenue.",
      source:
        "This metric is inherently scoped to the Subscription channel, so the global order-source filter does not alter it.",
    },
  };
};

const buildRevenueComposition = (metrics = {}) => {
  const merchandiseRevenue = Number(metrics.merchandiseRevenue) || 0;
  const deliveryRevenue = Number(metrics.deliveryRevenue) || 0;
  const discountAmount = Number(metrics.discountAmount) || 0;
  const discountedOrders = Number(metrics.discountedOrders) || 0;
  const grossRevenue = Number(metrics.grossRevenue) || 0;
  const refundAmount = Number(metrics.refundAmount) || 0;
  const netRevenue = Number(metrics.netRevenue) || 0;
  const preDiscountRevenue = merchandiseRevenue + deliveryRevenue;

  return {
    merchandiseRevenue,
    deliveryRevenue,
    discountAmount,
    discountedOrders,
    averageDiscountPerDiscountedOrder:
      discountedOrders > 0 ? discountAmount / discountedOrders : 0,
    discountRate: roundPercentage(discountAmount, preDiscountRevenue),
    preDiscountRevenue,
    grossRevenue,
    refundAmount,
    netRevenue,
  };
};

async function GetPerformanceMetrics({
  range,
  from,
  to,
  orderSource,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
} = {}) {
  const salesMatch = buildSalesOrderMatch({
    range,
    from,
    to,
    orderSource,
    timeZone,
  });
  const sourceMatch = buildOrderSourceMatch(orderSource);
  const refundBaseMatch = {
    ...ACTIVE_ORDER_MATCH,
    ...sourceMatch,
  };

  const [salesAgg, refundAgg, legacyRefundAgg] = await Promise.all([
    Order.aggregate([
      { $match: salesMatch },
      {
        $addFields: {
          _analyticsUnitsInOrder: {
            $sum: {
              $map: {
                input: { $ifNull: ["$items", []] },
                as: "item",
                in: { $ifNull: ["$$item.quantity", 0] },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          grossRevenue: { $sum: COLLECTED_AMOUNT_EXPRESSION },
          merchandiseRevenue: { $sum: COLLECTED_MERCHANDISE_EXPRESSION },
          deliveryRevenue: { $sum: COLLECTED_DELIVERY_EXPRESSION },
          discountAmount: { $sum: COLLECTED_DISCOUNT_EXPRESSION },
          discountedOrders: {
            $sum: {
              $cond: [
                { $gt: [COLLECTED_DISCOUNT_EXPRESSION, 0] },
                1,
                0,
              ],
            },
          },
          unitsSold: { $sum: "$_analyticsUnitsInOrder" },
        },
      },
    ]),

    Order.aggregate([
      { $match: { ...refundBaseMatch, ...buildRefundLedgerPrefilter({ range, from, to, timeZone }) } },
      { $unwind: "$refunds" },
      {
        $match: buildRefundEventMatch({
          range,
          from,
          to,
          timeZone,
        }),
      },
      {
        $group: {
          _id: null,
          refundAmount: { $sum: REFUND_AMOUNT_EXPRESSION },
        },
      },
    ]),

    Order.aggregate([
      {
        $match: {
          ...refundBaseMatch,
          status: "refunded",
          ...buildLegacyRefundEventMatch({ range, from, to, timeZone }),
        },
      },
      {
        $addFields: {
          _analyticsSucceededRefundCount: {
            $size: {
              $filter: {
                input: { $ifNull: ["$refunds", []] },
                as: "refund",
                cond: { $eq: ["$$refund.status", "succeeded"] },
              },
            },
          },
        },
      },
      { $match: { _analyticsSucceededRefundCount: 0 } },
      {
        $group: {
          _id: null,
          refundAmount: { $sum: COLLECTED_AMOUNT_EXPRESSION },
        },
      },
    ]),
  ]);

  const sales = salesAgg?.[0] || {};
  const totalOrders = sales.totalOrders ?? 0;
  const grossRevenue = sales.grossRevenue ?? 0;
  const refundAmount =
    (refundAgg?.[0]?.refundAmount ?? 0) +
    (legacyRefundAgg?.[0]?.refundAmount ?? 0);
  const netRevenue = grossRevenue - refundAmount;
  const unitsSold = sales.unitsSold ?? 0;
  const merchandiseRevenue = sales.merchandiseRevenue ?? 0;
  const deliveryRevenue = sales.deliveryRevenue ?? 0;
  const discountAmount = sales.discountAmount ?? 0;
  const discountedOrders = sales.discountedOrders ?? 0;

  return {
    totalOrders,
    grossRevenue,
    merchandiseRevenue,
    deliveryRevenue,
    discountAmount,
    discountedOrders,
    refundAmount,
    netRevenue,
    revenue: netRevenue,
    averageOrderValue: totalOrders > 0 ? grossRevenue / totalOrders : 0,
    unitsSold,
    averageUnitsPerOrder: totalOrders > 0 ? unitsSold / totalOrders : 0,
  };
}

async function GetStockCounts() {
  const [result] = await ProductVariant.aggregate([
    { $match: { status: "active" } },
    STOCK_AVAILABLE_ADD_FIELDS,
    {
      $facet: {
        lowStock: [LOW_STOCK_MATCH, { $count: "count" }],
        outOfStock: [OUT_OF_STOCK_MATCH, { $count: "count" }],
      },
    },
    {
      $project: {
        lowStockItems: {
          $ifNull: [{ $arrayElemAt: ["$lowStock.count", 0] }, 0],
        },
        outOfStockItems: {
          $ifNull: [{ $arrayElemAt: ["$outOfStock.count", 0] }, 0],
        },
      },
    },
  ]);

  return {
    lowStockItems: result?.lowStockItems ?? 0,
    outOfStockItems: result?.outOfStockItems ?? 0,
  };
}

async function GetDashboardStockSnapshot({ limit = 50 } = {}) {
  const lim = Math.max(1, Math.min(Number(limit) || 50, 200));

  const [result] = await ProductVariant.aggregate([
    { $match: { status: "active" } },
    STOCK_AVAILABLE_ADD_FIELDS,
    {
      $facet: {
        lowStock: [
          LOW_STOCK_MATCH,
          { $sort: { available: 1 } },
          { $limit: lim },
          STOCK_PRODUCT_LOOKUP,
          STOCK_PRODUCT_UNWIND,
          ...STOCK_DEDUP_STAGES,
          STOCK_ITEM_PROJECT,
        ],
        outOfStock: [
          OUT_OF_STOCK_MATCH,
          { $sort: { available: 1 } },
          { $limit: lim },
          STOCK_PRODUCT_LOOKUP,
          STOCK_PRODUCT_UNWIND,
          ...STOCK_DEDUP_STAGES,
          STOCK_ITEM_PROJECT,
        ],
        lowStockCount: [LOW_STOCK_MATCH, { $count: "count" }],
        outOfStockCount: [OUT_OF_STOCK_MATCH, { $count: "count" }],
      },
    },
  ]);

  return {
    success: true,
    data: {
      counts: {
        lowStockItems: result?.lowStockCount?.[0]?.count ?? 0,
        outOfStockItems: result?.outOfStockCount?.[0]?.count ?? 0,
      },
      lowStock: { items: result?.lowStock || [] },
      outOfStock: { items: result?.outOfStock || [] },
    },
  };
}

async function GetSummary({
  range,
  from,
  to,
  orderSource,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
  stockCountsPromise,
  performanceMetricsPromise,
} = {}) {
  // Operational/status metrics follow order creation time. Financial metrics
  // follow paidAt, with createdAt only as a legacy fallback.
  const orderMatch = buildOrderMatch({
    range,
    from,
    to,
    orderSource,
    timeZone,
  });
  const salesMatch = buildSalesOrderMatch({
    range,
    from,
    to,
    orderSource,
    timeZone,
  });
  const { start } = parseDateRange({ range, from, to, timeZone });

  const sourceMatch = buildOrderSourceMatch(orderSource);
  const customerAggPipeline = start
    ? [
        { $match: { ...salesMatch, customer: { $ne: null } } },
        { $group: { _id: "$customer" } },
        {
          $lookup: {
            from: "orders",
            let: { customerId: "$_id" },
            pipeline: [
              {
                $match: {
                  ...ACTIVE_ORDER_MATCH,
                  ...sourceMatch,
                  status: { $in: COLLECTED_ORDER_STATUSES },
                  $expr: {
                    $and: [
                      { $eq: ["$customer", "$$customerId"] },
                      {
                        $lt: [EFFECTIVE_PAID_AT_EXPRESSION, start],
                      },
                    ],
                  },
                },
              },
              { $limit: 1 },
              { $project: { _id: 1 } },
            ],
            as: "previousCollected",
          },
        },
        {
          $project: {
            isNew: { $eq: [{ $size: "$previousCollected" }, 0] },
          },
        },
        {
          $group: {
            _id: null,
            newCustomers: { $sum: { $cond: ["$isNew", 1, 0] } },
            repeatCustomers: { $sum: { $cond: ["$isNew", 0, 1] } },
          },
        },
      ]
    : [
        { $match: { ...salesMatch, customer: { $ne: null } } },
        { $group: { _id: "$customer", orders: { $sum: 1 } } },
        {
          $group: {
            _id: null,
            newCustomers: { $sum: 1 },
            repeatCustomers: {
              $sum: { $cond: [{ $gt: ["$orders", 1] }, 1, 0] },
            },
          },
        },
      ];

  const [performance, statusCounts, stockCounts, customersAgg] =
    await Promise.all([
      performanceMetricsPromise ||
        GetPerformanceMetrics({ range, from, to, orderSource, timeZone }),

      Order.aggregate([
        {
          $match: {
            ...orderMatch,
            status: { $in: ANALYTICS_ORDER_STATUSES },
          },
        },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),

      stockCountsPromise || GetStockCounts(),

      Order.aggregate(customerAggPipeline),
    ]);

  const {
    totalOrders,
    grossRevenue,
    merchandiseRevenue,
    deliveryRevenue,
    discountAmount,
    discountedOrders,
    refundAmount,
    netRevenue,
    revenue,
    averageOrderValue,
    unitsSold,
    averageUnitsPerOrder,
  } = performance;

  const customerStats = customersAgg?.[0] || {};
  const newCustomers = customerStats.newCustomers ?? 0;
  const repeatCustomers = customerStats.repeatCustomers ?? 0;

  const counts = buildAnalyticsCounts(statusCounts);
  const summaryCounts = summarizeAnalyticsCounts(counts);

  const lowStockItemsCount = stockCounts.lowStockItems;
  const outOfStockItemsCount = stockCounts.outOfStockItems;

  return {
    success: true,
    data: {
      totalOrders,
      // "revenue" remains the primary UI field, but now has a defined meaning:
      // collected sales in the period less refunds issued in the period.
      revenue,
      grossRevenue,
      merchandiseRevenue,
      deliveryRevenue,
      discountAmount,
      discountedOrders,
      refundAmount,
      netRevenue,
      averageOrderValue,
      unitsSold,
      averageUnitsPerOrder,
      totalRefunds: summaryCounts.totalRefunds,
      newCustomers,
      repeatCustomers,
      pendingOrders: summaryCounts.pending,
      paidOrders: counts.paid,
      partiallyPaidOrders: counts.partially_paid,
      failedOrders: counts.failed,
      cancelledOrders: counts.cancelled,
      refundPendingOrders: counts.refund_pending,
      refundedOrders: summaryCounts.refunded,
      refundFailedOrders: counts.refund_failed,
      lowStockItems: lowStockItemsCount,
      outOfStockItems: outOfStockItemsCount,
      orderStatus: {
        Pending: summaryCounts.pending,
        Paid: counts.paid,
        "Partially Paid": counts.partially_paid,
        Failed: counts.failed,
        Cancelled: counts.cancelled,
        "Refund Pending": counts.refund_pending,
        Refunded: summaryCounts.refunded,
        "Refund Failed": counts.refund_failed,
      },
    },
  };
}

async function GetSalesBreakdown({
  range,
  from,
  to,
  orderSource,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
} = {}) {
  const salesMatch = buildSalesOrderMatch({
    range,
    from,
    to,
    orderSource,
    timeZone,
  });
  const refundBaseMatch = {
    ...ACTIVE_ORDER_MATCH,
    ...buildOrderSourceMatch(orderSource),
  };

  const [salesRows, refundRows, legacyRefundRows] = await Promise.all([
    Order.aggregate([
      { $match: salesMatch },
      {
        $addFields: {
          _analyticsChannel: SALES_CHANNEL_EXPRESSION,
          _analyticsUnitsInOrder: {
            $sum: {
              $map: {
                input: { $ifNull: ["$items", []] },
                as: "item",
                in: { $ifNull: ["$$item.quantity", 0] },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: "$_analyticsChannel",
          totalOrders: { $sum: 1 },
          grossRevenue: { $sum: COLLECTED_AMOUNT_EXPRESSION },
          merchandiseRevenue: { $sum: COLLECTED_MERCHANDISE_EXPRESSION },
          deliveryRevenue: { $sum: COLLECTED_DELIVERY_EXPRESSION },
          discountAmount: { $sum: COLLECTED_DISCOUNT_EXPRESSION },
          discountedOrders: {
            $sum: {
              $cond: [
                { $gt: [COLLECTED_DISCOUNT_EXPRESSION, 0] },
                1,
                0,
              ],
            },
          },
          unitsSold: { $sum: "$_analyticsUnitsInOrder" },
        },
      },
    ]),

    Order.aggregate([
      {
        $match: {
          ...refundBaseMatch,
          ...buildRefundLedgerPrefilter({ range, from, to, timeZone }),
        },
      },
      {
        $addFields: {
          _analyticsChannel: SALES_CHANNEL_EXPRESSION,
        },
      },
      { $unwind: "$refunds" },
      {
        $match: buildRefundEventMatch({
          range,
          from,
          to,
          timeZone,
        }),
      },
      {
        $group: {
          _id: "$_analyticsChannel",
          refundAmount: { $sum: REFUND_AMOUNT_EXPRESSION },
        },
      },
    ]),

    Order.aggregate([
      {
        $match: {
          ...refundBaseMatch,
          status: "refunded",
          ...buildLegacyRefundEventMatch({ range, from, to, timeZone }),
        },
      },
      {
        $addFields: {
          _analyticsSucceededRefundCount: {
            $size: {
              $filter: {
                input: { $ifNull: ["$refunds", []] },
                as: "refund",
                cond: { $eq: ["$$refund.status", "succeeded"] },
              },
            },
          },
        },
      },
      { $match: { _analyticsSucceededRefundCount: 0 } },
      {
        $addFields: {
          _analyticsChannel: SALES_CHANNEL_EXPRESSION,
        },
      },
      {
        $group: {
          _id: "$_analyticsChannel",
          refundAmount: { $sum: COLLECTED_AMOUNT_EXPRESSION },
        },
      },
    ]),
  ]);

  const rowsByChannel = new Map(
    SALES_CHANNELS.map((channel) => [
      channel,
      {
        key: channel,
        label: SALES_CHANNEL_LABELS[channel] || channel,
        grossRevenue: 0,
        merchandiseRevenue: 0,
        deliveryRevenue: 0,
        discountAmount: 0,
        discountedOrders: 0,
        refundAmount: 0,
        netRevenue: 0,
        totalOrders: 0,
        unitsSold: 0,
        averageOrderValue: 0,
        averageUnitsPerOrder: 0,
        averageDiscountPerDiscountedOrder: 0,
        discountRate: 0,
        grossRevenueShare: 0,
        orderShare: 0,
      },
    ]),
  );

  for (const row of salesRows || []) {
    const channel = rowsByChannel.get(row._id);
    if (!channel) continue;

    channel.totalOrders = Number(row.totalOrders) || 0;
    channel.grossRevenue = Number(row.grossRevenue) || 0;
    channel.merchandiseRevenue = Number(row.merchandiseRevenue) || 0;
    channel.deliveryRevenue = Number(row.deliveryRevenue) || 0;
    channel.discountAmount = Number(row.discountAmount) || 0;
    channel.discountedOrders = Number(row.discountedOrders) || 0;
    channel.unitsSold = Number(row.unitsSold) || 0;
  }

  for (const row of [...(refundRows || []), ...(legacyRefundRows || [])]) {
    const channel = rowsByChannel.get(row._id);
    if (!channel) continue;
    channel.refundAmount += Number(row.refundAmount) || 0;
  }

  const channels = SALES_CHANNELS.map((key) => rowsByChannel.get(key));
  const totals = channels.reduce(
    (acc, channel) => {
      acc.grossRevenue += channel.grossRevenue;
      acc.merchandiseRevenue += channel.merchandiseRevenue;
      acc.deliveryRevenue += channel.deliveryRevenue;
      acc.discountAmount += channel.discountAmount;
      acc.discountedOrders += channel.discountedOrders;
      acc.refundAmount += channel.refundAmount;
      acc.totalOrders += channel.totalOrders;
      acc.unitsSold += channel.unitsSold;
      return acc;
    },
    {
      grossRevenue: 0,
      merchandiseRevenue: 0,
      deliveryRevenue: 0,
      discountAmount: 0,
      discountedOrders: 0,
      refundAmount: 0,
      netRevenue: 0,
      totalOrders: 0,
      unitsSold: 0,
      averageOrderValue: 0,
      averageUnitsPerOrder: 0,
      averageDiscountPerDiscountedOrder: 0,
      discountRate: 0,
    },
  );

  totals.netRevenue = totals.grossRevenue - totals.refundAmount;
  totals.averageOrderValue =
    totals.totalOrders > 0 ? totals.grossRevenue / totals.totalOrders : 0;
  totals.averageUnitsPerOrder =
    totals.totalOrders > 0 ? totals.unitsSold / totals.totalOrders : 0;
  totals.averageDiscountPerDiscountedOrder =
    totals.discountedOrders > 0
      ? totals.discountAmount / totals.discountedOrders
      : 0;
  totals.discountRate = roundPercentage(
    totals.discountAmount,
    totals.merchandiseRevenue + totals.deliveryRevenue,
  );

  for (const channel of channels) {
    channel.netRevenue = channel.grossRevenue - channel.refundAmount;
    channel.averageOrderValue =
      channel.totalOrders > 0
        ? channel.grossRevenue / channel.totalOrders
        : 0;
    channel.averageUnitsPerOrder =
      channel.totalOrders > 0 ? channel.unitsSold / channel.totalOrders : 0;
    channel.averageDiscountPerDiscountedOrder =
      channel.discountedOrders > 0
        ? channel.discountAmount / channel.discountedOrders
        : 0;
    channel.discountRate = roundPercentage(
      channel.discountAmount,
      channel.merchandiseRevenue + channel.deliveryRevenue,
    );
    channel.grossRevenueShare = roundPercentage(
      channel.grossRevenue,
      totals.grossRevenue,
    );
    channel.orderShare = roundPercentage(
      channel.totalOrders,
      totals.totalOrders,
    );
  }

  return {
    success: true,
    data: {
      channels,
      totals,
    },
  };
}

async function GetRecurringVsOneTime({
  range,
  from,
  to,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
} = {}) {
  const breakdown = await GetSalesBreakdown({
    range,
    from,
    to,
    timeZone,
  });
  if (!breakdown.success) return breakdown;

  return {
    success: true,
    data: buildRecurringVsOneTimeData(breakdown.data),
  };
}

async function GetSubscriptionRevenue({
  range,
  from,
  to,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
} = {}) {
  const breakdown = await GetSalesBreakdown({
    range,
    from,
    to,
    orderSource: "subscription",
    timeZone,
  });
  if (!breakdown.success) return breakdown;

  return {
    success: true,
    data: buildSubscriptionRevenueData(breakdown.data),
  };
}

async function GetTopSubscriptionProductsVariants({
  range,
  from,
  to,
  limit = 5,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
} = {}) {
  const salesMatch = buildSalesOrderMatch({
    range,
    from,
    to,
    orderSource: "subscription",
    timeZone,
  });
  const lim = Math.max(1, Math.min(Number(limit) || 5, 25));

  const productStages = [
    {
      $group: {
        _id: "$productId",
        productId: { $first: "$productId" },
        productNameSnapshot: { $first: "$productNameSnapshot" },
        totalRevenue: { $sum: "$totalRevenue" },
        totalUnits: { $sum: "$totalUnits" },
        orderIdSets: { $push: "$orderIds" },
      },
    },
    {
      $addFields: {
        orderCount: {
          $size: {
            $reduce: {
              input: "$orderIdSets",
              initialValue: [],
              in: {
                $setUnion: [
                  "\u0024\u0024value",
                  "\u0024\u0024this",
                ],
              },
            },
          },
        },
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "productId",
        foreignField: "_id",
        as: "catalogProduct",
      },
    },
    {
      $project: {
        _id: 0,
        productId: 1,
        productName: {
          $cond: [
            {
              $and: [
                { $ne: ["$productNameSnapshot", null] },
                { $ne: ["$productNameSnapshot", ""] },
              ],
            },
            "$productNameSnapshot",
            {
              $ifNull: [
                { $arrayElemAt: ["$catalogProduct.name", 0] },
                {
                  $concat: [
                    "Deleted product · ",
                    {
                      $substrBytes: [
                        { $toString: "$productId" },
                        18,
                        6,
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        catalogStatus: {
          $ifNull: [
            { $arrayElemAt: ["$catalogProduct.status", 0] },
            "deleted",
          ],
        },
        totalRevenue: 1,
        totalUnits: 1,
        orderCount: 1,
      },
    },
  ];

  const variantStages = [
    {
      $lookup: {
        from: "products",
        localField: "productId",
        foreignField: "_id",
        as: "catalogProduct",
      },
    },
    {
      $lookup: {
        from: "productvariants",
        localField: "variantId",
        foreignField: "_id",
        as: "catalogVariant",
      },
    },
    {
      $project: {
        _id: 0,
        productId: 1,
        variantId: 1,
        productName: {
          $cond: [
            {
              $and: [
                { $ne: ["$productNameSnapshot", null] },
                { $ne: ["$productNameSnapshot", ""] },
              ],
            },
            "$productNameSnapshot",
            {
              $ifNull: [
                { $arrayElemAt: ["$catalogProduct.name", 0] },
                {
                  $concat: [
                    "Deleted product · ",
                    {
                      $substrBytes: [
                        { $toString: "$productId" },
                        18,
                        6,
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        variantName: {
          $cond: [
            {
              $and: [
                { $ne: ["$variantNameSnapshot", null] },
                { $ne: ["$variantNameSnapshot", ""] },
              ],
            },
            "$variantNameSnapshot",
            {
              $ifNull: [
                { $arrayElemAt: ["$catalogVariant.name", 0] },
                {
                  $concat: [
                    "Deleted variant · ",
                    {
                      $substrBytes: [
                        { $toString: "$variantId" },
                        18,
                        6,
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        sku: {
          $cond: [
            {
              $and: [
                { $ne: ["$skuSnapshot", null] },
                { $ne: ["$skuSnapshot", ""] },
              ],
            },
            "$skuSnapshot",
            {
              $ifNull: [
                { $arrayElemAt: ["$catalogVariant.sku", 0] },
                "Unknown SKU",
              ],
            },
          ],
        },
        catalogStatus: {
          $ifNull: [
            { $arrayElemAt: ["$catalogVariant.status", 0] },
            "deleted",
          ],
        },
        totalRevenue: 1,
        totalUnits: 1,
        orderCount: 1,
      },
    },
  ];

  const [result] = await Order.aggregate([
    { $match: salesMatch },
    { $addFields: { _analyticsPaidAt: EFFECTIVE_PAID_AT_EXPRESSION } },
    { $sort: { _analyticsPaidAt: -1, createdAt: -1 } },
    { $unwind: "$items" },
    { $addFields: { _analyticsLineRevenue: PRODUCT_LINE_REVENUE_EXPRESSION } },
    {
      $group: {
        _id: {
          product: "$items.product",
          variant: "$items.variant",
          order: "$_id",
        },
        productNameSnapshot: { $first: "$items.productName" },
        variantNameSnapshot: { $first: "$items.name" },
        skuSnapshot: { $first: "$items.sku" },
        latestPaidAt: { $first: "$_analyticsPaidAt" },
        revenue: { $sum: "$_analyticsLineRevenue" },
        units: { $sum: { $ifNull: ["$items.quantity", 0] } },
      },
    },
    { $sort: { latestPaidAt: -1 } },
    {
      $group: {
        _id: {
          product: "$_id.product",
          variant: "$_id.variant",
        },
        productId: { $first: "$_id.product" },
        variantId: { $first: "$_id.variant" },
        productNameSnapshot: { $first: "$productNameSnapshot" },
        variantNameSnapshot: { $first: "$variantNameSnapshot" },
        skuSnapshot: { $first: "$skuSnapshot" },
        latestPaidAt: { $first: "$latestPaidAt" },
        totalRevenue: { $sum: "$revenue" },
        totalUnits: { $sum: "$units" },
        orderIds: { $addToSet: "$_id.order" },
      },
    },
    { $addFields: { orderCount: { $size: "$orderIds" } } },
    { $match: { totalUnits: { $gt: 0 } } },
    { $sort: { latestPaidAt: -1 } },
    {
      $facet: {
        productsByRevenue: [
          ...productStages,
          {
            $sort: {
              totalRevenue: -1,
              totalUnits: -1,
              productName: 1,
            },
          },
          { $limit: lim },
        ],
        productsByUnits: [
          ...productStages,
          {
            $sort: {
              totalUnits: -1,
              totalRevenue: -1,
              productName: 1,
            },
          },
          { $limit: lim },
        ],
        productTotals: [
          ...productStages,
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$totalRevenue" },
              totalUnits: { $sum: "$totalUnits" },
              productsSold: { $sum: 1 },
            },
          },
        ],
        variantsByRevenue: [
          ...variantStages,
          {
            $sort: {
              totalRevenue: -1,
              totalUnits: -1,
              productName: 1,
              variantName: 1,
              sku: 1,
            },
          },
          { $limit: lim },
        ],
        variantsByUnits: [
          ...variantStages,
          {
            $sort: {
              totalUnits: -1,
              totalRevenue: -1,
              productName: 1,
              variantName: 1,
              sku: 1,
            },
          },
          { $limit: lim },
        ],
        variantTotals: [
          ...variantStages,
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$totalRevenue" },
              totalUnits: { $sum: "$totalUnits" },
              variantsSold: { $sum: 1 },
            },
          },
        ],
      },
    },
  ]);

  const productTotalsRow = result?.productTotals?.[0] || {};
  const variantTotalsRow = result?.variantTotals?.[0] || {};

  const productTotals = {
    totalRevenue: Number(productTotalsRow.totalRevenue) || 0,
    totalUnits: Number(productTotalsRow.totalUnits) || 0,
    productsSold: Number(productTotalsRow.productsSold) || 0,
  };
  const variantTotals = {
    totalRevenue: Number(variantTotalsRow.totalRevenue) || 0,
    totalUnits: Number(variantTotalsRow.totalUnits) || 0,
    variantsSold: Number(variantTotalsRow.variantsSold) || 0,
  };

  const normalizeProduct = (row) => ({
    ...row,
    totalRevenue: Number(row.totalRevenue) || 0,
    totalUnits: Number(row.totalUnits) || 0,
    orderCount: Number(row.orderCount) || 0,
    revenueContributionPercent: roundPercentage(
      Number(row.totalRevenue) || 0,
      productTotals.totalRevenue,
    ),
    unitContributionPercent: roundPercentage(
      Number(row.totalUnits) || 0,
      productTotals.totalUnits,
    ),
  });
  const normalizeVariant = (row) => ({
    ...row,
    totalRevenue: Number(row.totalRevenue) || 0,
    totalUnits: Number(row.totalUnits) || 0,
    orderCount: Number(row.orderCount) || 0,
    revenueContributionPercent: roundPercentage(
      Number(row.totalRevenue) || 0,
      variantTotals.totalRevenue,
    ),
    unitContributionPercent: roundPercentage(
      Number(row.totalUnits) || 0,
      variantTotals.totalUnits,
    ),
  });

  return {
    success: true,
    data: {
      products: {
        byRevenue: (result?.productsByRevenue || []).map(normalizeProduct),
        byUnits: (result?.productsByUnits || []).map(normalizeProduct),
        totals: productTotals,
      },
      variants: {
        byRevenue: (result?.variantsByRevenue || []).map(normalizeVariant),
        byUnits: (result?.variantsByUnits || []).map(normalizeVariant),
        totals: variantTotals,
      },
      metricBasis: {
        revenue:
          "Collected merchandise revenue from mutually exclusive Subscription-channel orders after proportional order discounts; excludes delivery fees and item-unattributed refunds.",
        units:
          "Historical units from collected Subscription-channel orders, including partially-paid orders.",
        ranking:
          "Products and variants are ranked from immutable order-item snapshots. Contribution denominators include all subscription-sold rows in the selected period before the display limit.",
        identity:
          "Historical product, variant and SKU snapshots are retained so renamed or deleted catalog entities remain visible.",
        source:
          "Imported/manual orders take classification precedence and are never included in Subscription product or variant rankings.",
      },
    },
  };
}

async function GetRevenueComposition({
  range,
  from,
  to,
  orderSource,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
} = {}) {
  const metrics = await GetPerformanceMetrics({
    range,
    from,
    to,
    orderSource,
    timeZone,
  });

  return {
    success: true,
    data: buildRevenueComposition(metrics),
  };
}

async function GetSummaryComparison({
  range,
  from,
  to,
  orderSource,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
  now = new Date(),
  currentMetrics,
  comparison = "previous_period",
} = {}) {
  const periods = resolveComparisonPeriods({
    range,
    from,
    to,
    timeZone,
    now,
    comparisonMode: comparison,
  });

  if (periods.reason === "invalid_comparison") {
    return {
      success: false,
      statusCode: 400,
      message:
        "Analytics comparison must be previous_period, previous_year, or none.",
    };
  }

  if (!periods.available) {
    return {
      success: true,
      data: {
        available: false,
        reason: periods.reason,
        strategy: periods.strategy,
        timeZone: periods.timeZone,
        currentPeriod: periods.current,
        previousPeriod: periods.previous,
        current: null,
        previous: null,
        changes: null,
      },
    };
  }

  const previousPromise = GetPerformanceMetrics({
    from: periods.previous.from,
    to: periods.previous.to,
    orderSource,
    timeZone: periods.timeZone,
  });

  const current =
    currentMetrics ||
    (await GetPerformanceMetrics({
      from: periods.current.from,
      to: periods.current.to,
      orderSource,
      timeZone: periods.timeZone,
    }));
  const previous = await previousPromise;

  return {
    success: true,
    data: {
      available: true,
      reason: null,
      strategy: periods.strategy,
      timeZone: periods.timeZone,
      currentPeriod: periods.current,
      previousPeriod: periods.previous,
      current,
      previous,
      changes: compareMetrics(
        current,
        previous,
        PERFORMANCE_COMPARISON_METRICS,
      ),
    },
  };
}

async function GetRevenueSeries({
  range,
  from,
  to,
  interval,
  orderSource,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
} = {}) {
  const isUnbounded =
    !from &&
    !to &&
    (range === undefined || range === "all");
  const normalizedInterval = normalizeRevenueInterval(
    interval || (isUnbounded ? "month" : "week"),
  );

  if (isUnbounded && ["day", "week"].includes(normalizedInterval)) {
    return {
      success: false,
      statusCode: 400,
      message:
        "All-time analytics require a monthly or yearly time-series interval.",
    };
  }

  const bucketCount = estimateRevenueSeriesBucketCount({
    interval: normalizedInterval,
    range,
    from,
    to,
    timeZone,
  });

  if (bucketCount > MAX_REVENUE_SERIES_BUCKETS) {
    return {
      success: false,
      statusCode: 400,
      message: `Requested time series contains ${bucketCount} buckets; maximum is ${MAX_REVENUE_SERIES_BUCKETS}. Use a coarser interval or a shorter date range.`,
    };
  }

  const salesMatch = buildSalesOrderMatch({
    range,
    from,
    to,
    orderSource,
    timeZone,
  });
  const sourceMatch = buildOrderSourceMatch(orderSource);

  const salesStages = buildRevenueSeriesStages(normalizedInterval, range, {
    dateExpression: EFFECTIVE_PAID_AT_EXPRESSION,
    timeZone,
  });
  const refundDateExpression = {
    $ifNull: ["$refunds.refundedAt", "$refunds.createdAt"],
  };
  const refundStages = buildRevenueSeriesStages(normalizedInterval, range, {
    dateExpression: refundDateExpression,
    timeZone,
  });
  const legacyRefundStages = buildRevenueSeriesStages(normalizedInterval, range, {
    dateExpression: "$refund.refundedAt",
    timeZone,
  });

  const [salesRows, refundRows, legacyRefundRows] = await Promise.all([
    Order.aggregate([
      { $match: salesMatch },
      {
        $addFields: {
          _analyticsChannel: SALES_CHANNEL_EXPRESSION,
        },
      },
      {
        $group: {
          _id: {
            ...salesStages.groupId,
            channel: "$_analyticsChannel",
          },
          revenue: { $sum: COLLECTED_AMOUNT_EXPRESSION },
          orders: { $sum: 1 },
        },
      },
      { $sort: { ...salesStages.sortStage, "_id.channel": 1 } },
      {
        $project: {
          ...salesStages.projectStage,
          channel: "$_id.channel",
        },
      },
    ]),

    Order.aggregate([
      {
        $match: {
          ...ACTIVE_ORDER_MATCH,
          ...sourceMatch,
          ...buildRefundLedgerPrefilter({ range, from, to, timeZone }),
        },
      },
      {
        $addFields: {
          _analyticsChannel: SALES_CHANNEL_EXPRESSION,
        },
      },
      { $unwind: "$refunds" },
      {
        $match: buildRefundEventMatch({
          range,
          from,
          to,
          timeZone,
        }),
      },
      {
        $group: {
          _id: {
            ...refundStages.groupId,
            channel: "$_analyticsChannel",
          },
          revenue: { $sum: REFUND_AMOUNT_EXPRESSION },
          orders: { $sum: 0 },
        },
      },
      { $sort: { ...refundStages.sortStage, "_id.channel": 1 } },
      {
        $project: {
          ...refundStages.projectStage,
          channel: "$_id.channel",
        },
      },
    ]),

    Order.aggregate([
      {
        $match: {
          ...ACTIVE_ORDER_MATCH,
          ...sourceMatch,
          status: "refunded",
          ...buildLegacyRefundEventMatch({ range, from, to, timeZone }),
        },
      },
      {
        $addFields: {
          _analyticsSucceededRefundCount: {
            $size: {
              $filter: {
                input: { $ifNull: ["$refunds", []] },
                as: "refund",
                cond: { $eq: ["$$refund.status", "succeeded"] },
              },
            },
          },
          _analyticsChannel: SALES_CHANNEL_EXPRESSION,
        },
      },
      { $match: { _analyticsSucceededRefundCount: 0 } },
      {
        $group: {
          _id: {
            ...legacyRefundStages.groupId,
            channel: "$_analyticsChannel",
          },
          revenue: { $sum: COLLECTED_AMOUNT_EXPRESSION },
          orders: { $sum: 0 },
        },
      },
      { $sort: { ...legacyRefundStages.sortStage, "_id.channel": 1 } },
      {
        $project: {
          ...legacyRefundStages.projectStage,
          channel: "$_id.channel",
        },
      },
    ]),
  ]);

  const emptyPoint = (label) => ({
    label,
    grossRevenue: 0,
    refunds: 0,
    netRevenue: 0,
    revenue: 0,
    orders: 0,
  });

  const byLabel = new Map();
  const byChannel = new Map(
    SALES_CHANNELS.map((channel) => [channel, new Map()]),
  );

  const applySale = (target, row) => {
    const point = target.get(row.label) || emptyPoint(row.label);
    const revenue = Number(row.revenue) || 0;
    point.grossRevenue += revenue;
    point.netRevenue = point.grossRevenue - point.refunds;
    point.revenue = point.netRevenue;
    point.orders += Number(row.orders) || 0;
    target.set(row.label, point);
  };

  const applyRefund = (target, row) => {
    const point = target.get(row.label) || emptyPoint(row.label);
    point.refunds += Number(row.revenue) || 0;
    point.netRevenue = point.grossRevenue - point.refunds;
    point.revenue = point.netRevenue;
    target.set(row.label, point);
  };

  for (const row of salesRows || []) {
    applySale(byLabel, row);
    const channelMap = byChannel.get(row.channel);
    if (channelMap) applySale(channelMap, row);
  }

  for (const row of [...(refundRows || []), ...(legacyRefundRows || [])]) {
    applyRefund(byLabel, row);
    const channelMap = byChannel.get(row.channel);
    if (channelMap) applyRefund(channelMap, row);
  }

  const sparsePoints = Array.from(byLabel.values()).sort((a, b) =>
    String(a.label).localeCompare(String(b.label)),
  );
  const points = fillRevenueSeriesPoints({
    points: sparsePoints,
    interval: normalizedInterval,
    range,
    from,
    to,
    timeZone,
  });
  const totals = summarizeRevenueSeries(points);
  const parsedPeriod = parseDateRange({ range, from, to, timeZone });
  const period =
    parsedPeriod.start && parsedPeriod.end
      ? {
          from: formatYmdInTimeZone(parsedPeriod.start, timeZone),
          to: formatYmdInTimeZone(parsedPeriod.end, timeZone),
          timeZone: parsedPeriod.timeZone,
        }
      : null;

  const salesTrends = {
    interval: normalizedInterval,
    period,
    channels: SALES_CHANNELS.map((key) => {
      const channelMap = byChannel.get(key) || new Map();
      const channelPoints = points.map((point) => ({
        ...emptyPoint(point.label),
        ...(channelMap.get(point.label) || {}),
        label: point.label,
      }));

      return {
        key,
        label: SALES_CHANNEL_LABELS[key] || key,
        points: channelPoints,
        totals: summarizeRevenueSeries(channelPoints),
      };
    }),
  };

  return {
    success: true,
    data: {
      interval: normalizedInterval,
      period,
      points,
      totals,
      salesTrends,
    },
  };
}

async function GetSubscriptionTrends({
  range,
  from,
  to,
  interval,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
  revenueSeriesPromise,
} = {}) {
  const isUnbounded =
    !from &&
    !to &&
    (range === undefined || range === "all");
  const normalizedInterval = normalizeRevenueInterval(
    interval || (isUnbounded ? "month" : "week"),
  );

  if (isUnbounded && ["day", "week"].includes(normalizedInterval)) {
    return {
      success: false,
      statusCode: 400,
      message:
        "All-time analytics require a monthly or yearly time-series interval.",
    };
  }

  const bucketCount = estimateRevenueSeriesBucketCount({
    interval: normalizedInterval,
    range,
    from,
    to,
    timeZone,
  });
  if (bucketCount > MAX_REVENUE_SERIES_BUCKETS) {
    return {
      success: false,
      statusCode: 400,
      message: `Requested time series contains ${bucketCount} buckets; maximum is ${MAX_REVENUE_SERIES_BUCKETS}. Use a coarser interval or a shorter date range.`,
    };
  }

  const parsedPeriod = parseDateRange({ range, from, to, timeZone });
  if (parsedPeriod.invalid) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid analytics date range.",
    };
  }

  const createdStages = buildRevenueSeriesStages(normalizedInterval, range, {
    dateExpression: "$createdAt",
    timeZone,
  });
  const cancelledStages = buildRevenueSeriesStages(normalizedInterval, range, {
    dateExpression: "$cancelledAt",
    timeZone,
  });

  const seriesWork =
    revenueSeriesPromise ||
    GetRevenueSeries({
      range,
      from,
      to,
      interval: normalizedInterval,
      orderSource: "subscription",
      timeZone,
    });

  const cancelledAtMatch = buildEventDateMatch({
    range,
    from,
    to,
    field: "cancelledAt",
    timeZone,
  });
  const cancellationMatch = {
    status: "cancelled",
    ...(Object.keys(cancelledAtMatch).length > 0
      ? cancelledAtMatch
      : { cancelledAt: { $ne: null } }),
  };

  const [series, newRows, cancelledRows] = await Promise.all([
    seriesWork,
    Subscription.aggregate([
      { $match: buildCreatedAtMatch({ range, from, to, timeZone }) },
      {
        $group: {
          _id: createdStages.groupId,
          count: { $sum: 1 },
        },
      },
      { $sort: createdStages.sortStage },
      {
        $project: {
          ...createdStages.projectStage,
          count: 1,
        },
      },
    ]),
    Subscription.aggregate([
      { $match: cancellationMatch },
      {
        $group: {
          _id: cancelledStages.groupId,
          count: { $sum: 1 },
        },
      },
      { $sort: cancelledStages.sortStage },
      {
        $project: {
          ...cancelledStages.projectStage,
          count: 1,
        },
      },
    ]),
  ]);

  if (!series.success) return series;

  const subscriptionChannel =
    series.data.salesTrends?.channels?.find(
      (channel) => channel.key === "subscription",
    ) || {
      points: [],
      totals: {
        grossRevenue: 0,
        refunds: 0,
        netRevenue: 0,
        revenue: 0,
        orders: 0,
      },
    };

  const newByLabel = new Map(
    (newRows || []).map((row) => [row.label, Number(row.count) || 0]),
  );
  const cancelledByLabel = new Map(
    (cancelledRows || []).map((row) => [row.label, Number(row.count) || 0]),
  );
  const revenueByLabel = new Map(
    (subscriptionChannel.points || []).map((point) => [point.label, point]),
  );

  const expectedLabels = buildExpectedSeriesLabels({
    interval: normalizedInterval,
    range,
    from,
    to,
    timeZone,
  });
  const labels =
    expectedLabels.length > 0
      ? expectedLabels
      : Array.from(
          new Set([
            ...newByLabel.keys(),
            ...cancelledByLabel.keys(),
            ...revenueByLabel.keys(),
          ]),
        ).sort((left, right) => String(left).localeCompare(String(right)));

  const points = labels.map((label) => {
    const revenuePoint = revenueByLabel.get(label) || {};
    return {
      label,
      newSubscriptions: newByLabel.get(label) || 0,
      cancelledSubscriptions: cancelledByLabel.get(label) || 0,
      grossRevenue: Number(revenuePoint.grossRevenue) || 0,
      refunds: Number(revenuePoint.refunds) || 0,
      netRevenue: Number(revenuePoint.netRevenue) || 0,
      revenue: Number(revenuePoint.netRevenue) || 0,
      orders: Number(revenuePoint.orders) || 0,
    };
  });

  const totals = points.reduce(
    (acc, point) => {
      acc.newSubscriptions += point.newSubscriptions;
      acc.cancelledSubscriptions += point.cancelledSubscriptions;
      acc.grossRevenue += point.grossRevenue;
      acc.refunds += point.refunds;
      acc.netRevenue += point.netRevenue;
      acc.revenue += point.revenue;
      acc.orders += point.orders;
      return acc;
    },
    {
      newSubscriptions: 0,
      cancelledSubscriptions: 0,
      grossRevenue: 0,
      refunds: 0,
      netRevenue: 0,
      revenue: 0,
      orders: 0,
    },
  );

  const period =
    parsedPeriod.start && parsedPeriod.end
      ? {
          from: formatYmdInTimeZone(parsedPeriod.start, timeZone),
          to: formatYmdInTimeZone(parsedPeriod.end, timeZone),
          timeZone: parsedPeriod.timeZone,
        }
      : null;

  return {
    success: true,
    data: {
      interval: normalizedInterval,
      period,
      points,
      totals,
      metricBasis: {
        newSubscriptions:
          "Subscriptions are counted in the bucket containing their immutable createdAt timestamp, regardless of later lifecycle status.",
        cancelledSubscriptions:
          "Only effective cancellations are counted, using cancelledAt. Scheduled cancellations are excluded until they become effective.",
        revenue:
          "Subscription net revenue is collected gross Subscription-channel sales minus refunds issued in each bucket.",
        activeSubscriptions:
          "Historical active-subscription counts are not reconstructed because lifecycle status snapshots are not stored.",
        source:
          "Subscription Trends are inherently scoped to the Subscription channel; the global order-source filter does not alter them.",
      },
    },
  };
}

async function GetSalesTrends(options = {}) {
  const series = await GetRevenueSeries(options);
  if (!series.success) return series;

  return {
    success: true,
    data: series.data.salesTrends,
  };
}

async function GetRevenueOverview({
  days = 7,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
  orderSource,
} = {}) {
  const d = Math.max(7, Math.min(Number(days) || 7, 90));
  const now = new Date();
  const todayKey = formatYmdInTimeZone(now, timeZone);
  const [year, month, day] = todayKey.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, month - 1, day - (d - 1)));
  const from = [
    String(startDate.getUTCFullYear()).padStart(4, "0"),
    String(startDate.getUTCMonth() + 1).padStart(2, "0"),
    String(startDate.getUTCDate()).padStart(2, "0"),
  ].join("-");

  const series = await GetRevenueSeries({
    from,
    to: todayKey,
    interval: "day",
    orderSource,
    timeZone,
  });

  const byDay = new Map(
    (series.data.points || []).map((point) => [point.label, point]),
  );

  const points = [];
  for (let i = 0; i < d; i += 1) {
    const date = new Date(
      Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate() + i,
      ),
    );
    const key = [
      String(date.getUTCFullYear()).padStart(4, "0"),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");
    const value = byDay.get(key);

    points.push({
      date: key,
      label: key,
      grossRevenue: value?.grossRevenue || 0,
      refunds: value?.refunds || 0,
      netRevenue: value?.netRevenue || 0,
      revenue: value?.revenue || 0,
      orders: value?.orders || 0,
      isToday: key === todayKey,
    });
  }

  return {
    success: true,
    data: {
      days: d,
      points,
    },
  };
}

async function GetOrderStatusCounts({ range, from, to, orderSource } = {}) {
  const orderMatch = buildOrderMatch({ range, from, to, orderSource });

  const statusCounts = await Order.aggregate([
    {
      $match: {
        ...orderMatch,
        status: { $in: ANALYTICS_ORDER_STATUSES },
      },
    },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const counts = buildAnalyticsCounts(statusCounts);
  const summaryCounts = summarizeAnalyticsCounts(counts);

  return {
    success: true,
    data: {
      counts: {
        Pending: summaryCounts.pending,
        Paid: counts.paid,
        Failed: counts.failed,
        Cancelled: counts.cancelled,
        "Refund Pending": counts.refund_pending,
        Refunded: summaryCounts.refunded,
        "Refund Failed": counts.refund_failed,
      },
    },
  };
}

async function GetTopProducts({
  range,
  from,
  to,
  limit = 5,
  orderSource,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
} = {}) {
  const salesMatch = buildSalesOrderMatch({
    range,
    from,
    to,
    orderSource,
    timeZone,
  });

  const lim = Math.max(1, Math.min(Number(limit) || 5, 25));

  const [result] = await Order.aggregate([
    { $match: salesMatch },
    { $addFields: { _analyticsPaidAt: EFFECTIVE_PAID_AT_EXPRESSION } },
    { $sort: { _analyticsPaidAt: -1, createdAt: -1 } },
    { $unwind: "$items" },
    { $addFields: { _analyticsLineRevenue: PRODUCT_LINE_REVENUE_EXPRESSION } },
    {
      $group: {
        _id: {
          product: "$items.product",
          variant: "$items.variant",
          order: "$_id",
        },
        productNameSnapshot: { $first: "$items.productName" },
        variantNameSnapshot: { $first: "$items.name" },
        skuSnapshot: { $first: "$items.sku" },
        latestPaidAt: { $first: "$_analyticsPaidAt" },
        revenue: { $sum: "$_analyticsLineRevenue" },
        quantity: { $sum: { $ifNull: ["$items.quantity", 0] } },
      },
    },
    { $sort: { latestPaidAt: -1 } },
    {
      $group: {
        _id: {
          product: "$_id.product",
          variant: "$_id.variant",
        },
        productNameSnapshot: { $first: "$productNameSnapshot" },
        variantNameSnapshot: { $first: "$variantNameSnapshot" },
        skuSnapshot: { $first: "$skuSnapshot" },
        latestPaidAt: { $first: "$latestPaidAt" },
        revenue: { $sum: "$revenue" },
        quantity: { $sum: "$quantity" },
        orderIds: { $addToSet: "$_id.order" },
      },
    },
    { $sort: { latestPaidAt: -1 } },
    {
      $group: {
        _id: "$_id.product",
        productId: { $first: "$_id.product" },
        productNameSnapshot: { $first: "$productNameSnapshot" },
        totalRevenue: { $sum: "$revenue" },
        totalQuantity: { $sum: "$quantity" },
        orderIdSets: { $push: "$orderIds" },
        variants: {
          $push: {
            variantId: "$_id.variant",
            name: "$variantNameSnapshot",
            sku: "$skuSnapshot",
            revenue: "$revenue",
            quantity: "$quantity",
            orderCount: { $size: "$orderIds" },
          },
        },
      },
    },
    {
      $addFields: {
        orderCount: {
          $size: {
            $reduce: {
              input: "$orderIdSets",
              initialValue: [],
              in: { $setUnion: ["$$value", "$$this"] },
            },
          },
        },
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "productId",
        foreignField: "_id",
        as: "catalogProduct",
      },
    },
    {
      $project: {
        _id: 0,
        productId: 1,
        productName: {
          $cond: [
            {
              $and: [
                { $ne: ["$productNameSnapshot", null] },
                { $ne: ["$productNameSnapshot", ""] },
              ],
            },
            "$productNameSnapshot",
            {
              $ifNull: [
                { $arrayElemAt: ["$catalogProduct.name", 0] },
                {
                  $concat: [
                    "Deleted product · ",
                    {
                      $substrBytes: [{ $toString: "$productId" }, 18, 6],
                    },
                  ],
                },
              ],
            },
          ],
        },
        catalogStatus: {
          $ifNull: [{ $arrayElemAt: ["$catalogProduct.status", 0] }, "deleted"],
        },
        totalRevenue: 1,
        totalQuantity: 1,
        orderCount: 1,
        averageSellingPrice: {
          $cond: [
            { $gt: ["$totalQuantity", 0] },
            { $divide: ["$totalRevenue", "$totalQuantity"] },
            0,
          ],
        },
        variants: 1,
      },
    },
    { $match: { totalQuantity: { $gt: 0 } } },
    {
      $facet: {
        byRevenue: [
          { $sort: { totalRevenue: -1, totalQuantity: -1, productName: 1 } },
          { $limit: lim },
        ],
        byUnits: [
          { $sort: { totalQuantity: -1, totalRevenue: -1, productName: 1 } },
          { $limit: lim },
        ],
        lowestByRevenue: [
          { $sort: { totalRevenue: 1, totalQuantity: 1, productName: 1 } },
          { $limit: lim },
        ],
        lowestByUnits: [
          { $sort: { totalQuantity: 1, totalRevenue: 1, productName: 1 } },
          { $limit: lim },
        ],
        totals: [
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$totalRevenue" },
              totalUnits: { $sum: "$totalQuantity" },
              productsSold: { $sum: 1 },
            },
          },
        ],
      },
    },
  ]);

  const totalsRow = result?.totals?.[0] || {};
  const totals = {
    totalRevenue: Number(totalsRow.totalRevenue) || 0,
    totalUnits: Number(totalsRow.totalUnits) || 0,
    productsSold: Number(totalsRow.productsSold) || 0,
  };

  const normalizeProduct = (product) => {
    const totalRevenue = Number(product?.totalRevenue) || 0;
    const totalQuantity = Number(product?.totalQuantity) || 0;
    const orderCount = Number(product?.orderCount) || 0;

    const variants = [...(product?.variants || [])]
      .map((variant) => {
        const revenue = Number(variant?.revenue) || 0;
        const quantity = Number(variant?.quantity) || 0;
        const variantOrderCount = Number(variant?.orderCount) || 0;

        return {
          ...variant,
          revenue,
          quantity,
          orderCount: variantOrderCount,
          averageSellingPrice: quantity > 0 ? revenue / quantity : 0,
          averageRevenuePerOrder:
            variantOrderCount > 0 ? revenue / variantOrderCount : 0,
          averageUnitsPerOrder:
            variantOrderCount > 0 ? quantity / variantOrderCount : 0,
          revenueContributionPercent: roundPercentage(revenue, totalRevenue),
          unitContributionPercent: roundPercentage(quantity, totalQuantity),
        };
      })
      .sort(
        (left, right) =>
          (right.revenue || 0) - (left.revenue || 0) ||
          (right.quantity || 0) - (left.quantity || 0),
      );

    return {
      ...product,
      totalRevenue,
      totalQuantity,
      orderCount,
      averageSellingPrice: totalQuantity > 0 ? totalRevenue / totalQuantity : 0,
      averageRevenuePerOrder:
        orderCount > 0 ? totalRevenue / orderCount : 0,
      averageUnitsPerOrder: orderCount > 0 ? totalQuantity / orderCount : 0,
      revenueContributionPercent: roundPercentage(
        totalRevenue,
        totals.totalRevenue,
      ),
      unitContributionPercent: roundPercentage(
        totalQuantity,
        totals.totalUnits,
      ),
      variants,
    };
  };

  const byRevenue = (result?.byRevenue || []).map(normalizeProduct);
  const byUnits = (result?.byUnits || []).map(normalizeProduct);
  const lowestByRevenue = (result?.lowestByRevenue || []).map(normalizeProduct);
  const lowestByUnits = (result?.lowestByUnits || []).map(normalizeProduct);

  return {
    success: true,
    data: {
      products: byRevenue,
      byRevenue,
      byUnits,
      lowestByRevenue,
      lowestByUnits,
      totals,
      metricBasis: {
        revenue:
          "Collected merchandise revenue after proportional order discounts; excludes delivery fees and item-unattributed refunds.",
        units:
          "Units on collected orders, including partially-paid orders.",
        contribution:
          "Share of collected product revenue or units across products with at least one sold unit in the selected period.",
        lowest:
          "Lowest-performing products among products with at least one sold unit in the selected period; unsold catalog products are excluded.",
      },
    },
  };
}

async function GetVariantUnits({
  range,
  from,
  to,
  limit = 10,
  orderSource,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
} = {}) {
  const salesMatch = buildSalesOrderMatch({
    range,
    from,
    to,
    orderSource,
    timeZone,
  });
  const lim = Math.max(1, Math.min(Number(limit) || 10, 25));

  const [result] = await Order.aggregate([
    { $match: salesMatch },
    {
      $addFields: {
        _analyticsPaidAt: EFFECTIVE_PAID_AT_EXPRESSION,
        _analyticsSalesChannel: SALES_CHANNEL_EXPRESSION,
      },
    },
    { $sort: { _analyticsPaidAt: -1, createdAt: -1 } },
    { $unwind: "$items" },
    { $addFields: { _analyticsLineRevenue: PRODUCT_LINE_REVENUE_EXPRESSION } },
    {
      $group: {
        _id: {
          product: "$items.product",
          variant: "$items.variant",
          order: "$_id",
        },
        productNameSnapshot: { $first: "$items.productName" },
        variantNameSnapshot: { $first: "$items.name" },
        skuSnapshot: { $first: "$items.sku" },
        latestPaidAt: { $first: "$_analyticsPaidAt" },
        salesChannel: { $first: "$_analyticsSalesChannel" },
        revenue: { $sum: "$_analyticsLineRevenue" },
        units: { $sum: { $ifNull: ["$items.quantity", 0] } },
      },
    },
    { $sort: { latestPaidAt: -1 } },
    {
      $group: {
        _id: {
          product: "$_id.product",
          variant: "$_id.variant",
        },
        productId: { $first: "$_id.product" },
        variantId: { $first: "$_id.variant" },
        productNameSnapshot: { $first: "$productNameSnapshot" },
        variantNameSnapshot: { $first: "$variantNameSnapshot" },
        skuSnapshot: { $first: "$skuSnapshot" },
        latestPaidAt: { $first: "$latestPaidAt" },
        totalRevenue: { $sum: "$revenue" },
        totalUnits: { $sum: "$units" },
        orderIds: { $addToSet: "$_id.order" },
        oneTimeRevenue: {
          $sum: { $cond: [{ $eq: ["$salesChannel", "website"] }, "$revenue", 0] },
        },
        oneTimeUnits: {
          $sum: { $cond: [{ $eq: ["$salesChannel", "website"] }, "$units", 0] },
        },
        oneTimeOrderIds: {
          $addToSet: {
            $cond: [{ $eq: ["$salesChannel", "website"] }, "$_id.order", null],
          },
        },
        subscriptionRevenue: {
          $sum: {
            $cond: [{ $eq: ["$salesChannel", "subscription"] }, "$revenue", 0],
          },
        },
        subscriptionUnits: {
          $sum: {
            $cond: [{ $eq: ["$salesChannel", "subscription"] }, "$units", 0],
          },
        },
        subscriptionOrderIds: {
          $addToSet: {
            $cond: [
              { $eq: ["$salesChannel", "subscription"] },
              "$_id.order",
              null,
            ],
          },
        },
        importedRevenue: {
          $sum: { $cond: [{ $eq: ["$salesChannel", "imported"] }, "$revenue", 0] },
        },
        importedUnits: {
          $sum: { $cond: [{ $eq: ["$salesChannel", "imported"] }, "$units", 0] },
        },
        importedOrderIds: {
          $addToSet: {
            $cond: [{ $eq: ["$salesChannel", "imported"] }, "$_id.order", null],
          },
        },
      },
    },
    {
      $addFields: {
        orderCount: { $size: "$orderIds" },
        oneTimeOrderCount: {
          $size: { $setDifference: ["$oneTimeOrderIds", [null]] },
        },
        subscriptionOrderCount: {
          $size: { $setDifference: ["$subscriptionOrderIds", [null]] },
        },
        importedOrderCount: {
          $size: { $setDifference: ["$importedOrderIds", [null]] },
        },
      },
    },
    { $match: { totalUnits: { $gt: 0 } } },
    {
      $lookup: {
        from: "products",
        localField: "productId",
        foreignField: "_id",
        as: "catalogProduct",
      },
    },
    {
      $lookup: {
        from: "productvariants",
        localField: "variantId",
        foreignField: "_id",
        as: "catalogVariant",
      },
    },
    {
      $project: {
        _id: 0,
        productId: 1,
        variantId: 1,
        productName: {
          $cond: [
            {
              $and: [
                { $ne: ["$productNameSnapshot", null] },
                { $ne: ["$productNameSnapshot", ""] },
              ],
            },
            "$productNameSnapshot",
            {
              $ifNull: [
                { $arrayElemAt: ["$catalogProduct.name", 0] },
                {
                  $concat: [
                    "Deleted product · ",
                    { $substrBytes: [{ $toString: "$productId" }, 18, 6] },
                  ],
                },
              ],
            },
          ],
        },
        variantName: {
          $cond: [
            {
              $and: [
                { $ne: ["$variantNameSnapshot", null] },
                { $ne: ["$variantNameSnapshot", ""] },
              ],
            },
            "$variantNameSnapshot",
            {
              $ifNull: [
                { $arrayElemAt: ["$catalogVariant.name", 0] },
                {
                  $concat: [
                    "Deleted variant · ",
                    { $substrBytes: [{ $toString: "$variantId" }, 18, 6] },
                  ],
                },
              ],
            },
          ],
        },
        sku: {
          $cond: [
            {
              $and: [
                { $ne: ["$skuSnapshot", null] },
                { $ne: ["$skuSnapshot", ""] },
              ],
            },
            "$skuSnapshot",
            {
              $ifNull: [
                { $arrayElemAt: ["$catalogVariant.sku", 0] },
                "Unknown SKU",
              ],
            },
          ],
        },
        catalogStatus: {
          $ifNull: [
            { $arrayElemAt: ["$catalogVariant.status", 0] },
            "deleted",
          ],
        },
        currentPrice: { $arrayElemAt: ["$catalogVariant.price", 0] },
        totalRevenue: 1,
        totalUnits: 1,
        orderCount: 1,
        oneTimeRevenue: 1,
        oneTimeUnits: 1,
        oneTimeOrderCount: 1,
        subscriptionRevenue: 1,
        subscriptionUnits: 1,
        subscriptionOrderCount: 1,
        importedRevenue: 1,
        importedUnits: 1,
        importedOrderCount: 1,
        comparedRevenue: {
          $add: ["$oneTimeRevenue", "$subscriptionRevenue"],
        },
        comparedUnits: {
          $add: ["$oneTimeUnits", "$subscriptionUnits"],
        },
        realisedSellingPrice: {
          $cond: [
            { $gt: ["$totalUnits", 0] },
            { $divide: ["$totalRevenue", "$totalUnits"] },
            0,
          ],
        },
        averageUnitsPerOrder: {
          $cond: [
            { $gt: ["$orderCount", 0] },
            { $divide: ["$totalUnits", "$orderCount"] },
            0,
          ],
        },
      },
    },
    {
      $facet: {
        byUnits: [
          {
            $sort: {
              totalUnits: -1,
              orderCount: -1,
              productName: 1,
              variantName: 1,
              sku: 1,
            },
          },
          { $limit: lim },
        ],
        byRevenue: [
          {
            $sort: {
              totalRevenue: -1,
              orderCount: -1,
              productName: 1,
              variantName: 1,
              sku: 1,
            },
          },
          { $limit: lim },
        ],
        bySalesMix: [
          { $match: { comparedUnits: { $gt: 0 } } },
          {
            $sort: {
              comparedRevenue: -1,
              comparedUnits: -1,
              productName: 1,
              variantName: 1,
              sku: 1,
            },
          },
          { $limit: lim },
        ],
        totals: [
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$totalRevenue" },
              totalUnits: { $sum: "$totalUnits" },
              variantsSold: { $sum: 1 },
              oneTimeRevenue: { $sum: "$oneTimeRevenue" },
              oneTimeUnits: { $sum: "$oneTimeUnits" },
              subscriptionRevenue: { $sum: "$subscriptionRevenue" },
              subscriptionUnits: { $sum: "$subscriptionUnits" },
              importedRevenue: { $sum: "$importedRevenue" },
              importedUnits: { $sum: "$importedUnits" },
            },
          },
        ],
      },
    },
  ]);

  const normalizeVariant = (variant) => {
    const totalRevenue = Number(variant.totalRevenue) || 0;
    const totalUnits = Number(variant.totalUnits) || 0;
    const realisedSellingPrice = Number(variant.realisedSellingPrice) || 0;
    const currentPrice =
      variant.currentPrice === null || variant.currentPrice === undefined
        ? null
        : Number(variant.currentPrice);
    const priceDifference =
      currentPrice === null ? null : realisedSellingPrice - currentPrice;
    const priceDifferencePercent =
      currentPrice !== null && currentPrice > 0
        ? Math.round((priceDifference / currentPrice) * 10000) / 100
        : null;
    const oneTime = {
      revenue: Number(variant.oneTimeRevenue) || 0,
      units: Number(variant.oneTimeUnits) || 0,
      orders: Number(variant.oneTimeOrderCount) || 0,
    };
    const subscription = {
      revenue: Number(variant.subscriptionRevenue) || 0,
      units: Number(variant.subscriptionUnits) || 0,
      orders: Number(variant.subscriptionOrderCount) || 0,
    };
    const importedExcluded = {
      revenue: Number(variant.importedRevenue) || 0,
      units: Number(variant.importedUnits) || 0,
      orders: Number(variant.importedOrderCount) || 0,
    };

    return {
      ...variant,
      totalRevenue,
      totalUnits,
      orderCount: Number(variant.orderCount) || 0,
      oneTime,
      subscription,
      importedExcluded,
      comparedRevenue: Number(variant.comparedRevenue) || 0,
      comparedUnits: Number(variant.comparedUnits) || 0,
      realisedSellingPrice,
      currentPrice,
      priceDifference,
      priceDifferencePercent,
      averageUnitsPerOrder: Number(variant.averageUnitsPerOrder) || 0,
    };
  };
  const totalsRow = result?.totals?.[0] || {};
  const contributionTotals = {
    totalRevenue: Number(totalsRow.totalRevenue) || 0,
    totalUnits: Number(totalsRow.totalUnits) || 0,
  };
  const normalizeWithContribution = (variant) => {
    const normalized = normalizeVariant(variant);
    return {
      ...normalized,
      revenueContributionPercent: roundPercentage(
        normalized.totalRevenue,
        contributionTotals.totalRevenue,
      ),
      unitContributionPercent: roundPercentage(
        normalized.totalUnits,
        contributionTotals.totalUnits,
      ),
    };
  };
  const byUnits = (result?.byUnits || []).map(normalizeWithContribution);
  const byRevenue = (result?.byRevenue || []).map(normalizeWithContribution);
  const bySalesMix = (result?.bySalesMix || []).map(normalizeWithContribution);

  return {
    success: true,
    data: {
      variants: byUnits,
      byUnits,
      byRevenue,
      bySalesMix,
      totals: {
        totalRevenue: Number(totalsRow.totalRevenue) || 0,
        totalUnits: Number(totalsRow.totalUnits) || 0,
        variantsSold: Number(totalsRow.variantsSold) || 0,
        oneTime: {
          revenue: Number(totalsRow.oneTimeRevenue) || 0,
          units: Number(totalsRow.oneTimeUnits) || 0,
        },
        subscription: {
          revenue: Number(totalsRow.subscriptionRevenue) || 0,
          units: Number(totalsRow.subscriptionUnits) || 0,
        },
        importedExcluded: {
          revenue: Number(totalsRow.importedRevenue) || 0,
          units: Number(totalsRow.importedUnits) || 0,
        },
      },
      metricBasis: {
        revenue:
          "Collected merchandise revenue after proportional order discounts; excludes delivery fees and item-unattributed refunds.",
        realisedSellingPrice:
          "Collected merchandise revenue divided by historical units sold, so discounts and partial payments reduce the realised per-unit price.",
        currentPrice:
          "Current catalog variant price at request time; deleted variants have no current-price comparison.",
        priceComparison:
          "Difference is realised selling price minus current catalog price; percentage difference uses current catalog price as the denominator.",
        salesMix:
          "Website One-Time and Subscription are mutually exclusive channels. Imported/manual orders are excluded from the comparison and reported separately.",
        contribution:
          "Share of collected variant revenue or historical units across variants with at least one sold unit in the selected period.",
        units:
          "Units on collected orders, including partially-paid orders.",
        ranking:
          "Variants are ranked from historical order-item snapshots; repeated lines are combined and order counts are de-duplicated.",
        identity:
          "Variant name and SKU come from immutable order-item snapshots, so deleted or renamed variants remain historically visible.",
      },
    },
  };
}

async function GetVariantRevenue(args = {}) {
  const result = await GetVariantUnits(args);
  if (!result.success) return result;

  return {
    success: true,
    data: {
      variants: result.data.byRevenue,
      byRevenue: result.data.byRevenue,
      totals: {
        totalRevenue: result.data.totals.totalRevenue,
        variantsSold: result.data.totals.variantsSold,
      },
      metricBasis: {
        revenue: result.data.metricBasis.revenue,
        ranking:
          "Variants are ranked by collected merchandise revenue in the selected period.",
        identity: result.data.metricBasis.identity,
      },
    },
  };
}

async function GetVariantRealisedPrice(args = {}) {
  const result = await GetVariantUnits(args);
  if (!result.success) return result;

  return {
    success: true,
    data: {
      variants: result.data.byRevenue,
      totals: {
        totalRevenue: result.data.totals.totalRevenue,
        totalUnits: result.data.totals.totalUnits,
        realisedSellingPrice:
          result.data.totals.totalUnits > 0
            ? result.data.totals.totalRevenue / result.data.totals.totalUnits
            : 0,
        variantsSold: result.data.totals.variantsSold,
      },
      metricBasis: {
        realisedSellingPrice: result.data.metricBasis.realisedSellingPrice,
        identity: result.data.metricBasis.identity,
      },
    },
  };
}

async function GetVariantPriceComparison(args = {}) {
  const result = await GetVariantUnits(args);
  if (!result.success) return result;

  return {
    success: true,
    data: {
      variants: result.data.byRevenue,
      totals: {
        totalRevenue: result.data.totals.totalRevenue,
        totalUnits: result.data.totals.totalUnits,
        realisedSellingPrice:
          result.data.totals.totalUnits > 0
            ? result.data.totals.totalRevenue / result.data.totals.totalUnits
            : 0,
        variantsSold: result.data.totals.variantsSold,
      },
      metricBasis: {
        realisedSellingPrice: result.data.metricBasis.realisedSellingPrice,
        currentPrice: result.data.metricBasis.currentPrice,
        priceComparison: result.data.metricBasis.priceComparison,
        identity: result.data.metricBasis.identity,
      },
    },
  };
}

async function GetVariantSalesMix(args = {}) {
  const result = await GetVariantUnits(args);
  if (!result.success) return result;

  return {
    success: true,
    data: {
      variants: result.data.bySalesMix.map((variant) => ({
        productId: variant.productId,
        variantId: variant.variantId,
        productName: variant.productName,
        variantName: variant.variantName,
        sku: variant.sku,
        catalogStatus: variant.catalogStatus,
        oneTime: variant.oneTime,
        subscription: variant.subscription,
        importedExcluded: variant.importedExcluded,
      })),
      totals: {
        oneTime: result.data.totals.oneTime,
        subscription: result.data.totals.subscription,
        importedExcluded: result.data.totals.importedExcluded,
      },
      metricBasis: {
        salesMix: result.data.metricBasis.salesMix,
        revenue: result.data.metricBasis.revenue,
        units: result.data.metricBasis.units,
        identity: result.data.metricBasis.identity,
      },
    },
  };
}

async function GetVariantContribution(args = {}) {
  const result = await GetVariantUnits(args);
  if (!result.success) return result;

  return {
    success: true,
    data: {
      variants: result.data.byRevenue,
      byRevenue: result.data.byRevenue,
      byUnits: result.data.byUnits,
      totals: {
        totalRevenue: result.data.totals.totalRevenue,
        totalUnits: result.data.totals.totalUnits,
        variantsSold: result.data.totals.variantsSold,
      },
      metricBasis: {
        contribution: result.data.metricBasis.contribution,
        revenue: result.data.metricBasis.revenue,
        units: result.data.metricBasis.units,
        identity: result.data.metricBasis.identity,
      },
    },
  };
}

async function GetVariantTrends({
  range,
  from,
  to,
  interval,
  limit = 5,
  orderSource,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
} = {}) {
  const isUnbounded =
    !from &&
    !to &&
    (range === undefined || range === "all");
  const normalizedInterval = normalizeRevenueInterval(
    interval || (isUnbounded ? "month" : "week"),
  );

  if (isUnbounded && ["day", "week"].includes(normalizedInterval)) {
    return {
      success: false,
      statusCode: 400,
      message:
        "All-time analytics require a monthly or yearly time-series interval.",
    };
  }

  const bucketCount = estimateRevenueSeriesBucketCount({
    interval: normalizedInterval,
    range,
    from,
    to,
    timeZone,
  });

  if (bucketCount > MAX_REVENUE_SERIES_BUCKETS) {
    return {
      success: false,
      statusCode: 400,
      message: `Requested time series contains ${bucketCount} buckets; maximum is ${MAX_REVENUE_SERIES_BUCKETS}. Use a coarser interval or a shorter date range.`,
    };
  }

  const salesMatch = buildSalesOrderMatch({
    range,
    from,
    to,
    orderSource,
    timeZone,
  });
  const lim = Math.max(1, Math.min(Number(limit) || 5, 10));
  const seriesStages = buildRevenueSeriesStages(
    normalizedInterval,
    range,
    {
      dateExpression: EFFECTIVE_PAID_AT_EXPRESSION,
      timeZone,
    },
  );

  const rows = await Order.aggregate([
    { $match: salesMatch },
    { $addFields: { _analyticsPaidAt: EFFECTIVE_PAID_AT_EXPRESSION } },
    { $sort: { _analyticsPaidAt: -1, createdAt: -1 } },
    { $unwind: "$items" },
    { $addFields: { _analyticsLineRevenue: PRODUCT_LINE_REVENUE_EXPRESSION } },
    {
      $group: {
        _id: {
          product: "$items.product",
          variant: "$items.variant",
          ...seriesStages.groupId,
        },
        productNameSnapshot: { $first: "$items.productName" },
        variantNameSnapshot: { $first: "$items.name" },
        skuSnapshot: { $first: "$items.sku" },
        latestPaidAt: { $first: "$_analyticsPaidAt" },
        revenue: { $sum: "$_analyticsLineRevenue" },
        units: { $sum: { $ifNull: ["$items.quantity", 0] } },
        orderIds: { $addToSet: "$_id" },
      },
    },
    {
      $project: {
        ...seriesStages.projectStage,
        productId: "$_id.product",
        variantId: "$_id.variant",
        productNameSnapshot: 1,
        variantNameSnapshot: 1,
        skuSnapshot: 1,
        latestPaidAt: 1,
        revenue: 1,
        units: 1,
        orders: { $size: "$orderIds" },
      },
    },
    { $sort: { latestPaidAt: -1 } },
    {
      $group: {
        _id: {
          product: "$productId",
          variant: "$variantId",
        },
        productId: { $first: "$productId" },
        variantId: { $first: "$variantId" },
        productNameSnapshot: { $first: "$productNameSnapshot" },
        variantNameSnapshot: { $first: "$variantNameSnapshot" },
        skuSnapshot: { $first: "$skuSnapshot" },
        latestPaidAt: { $first: "$latestPaidAt" },
        totalRevenue: { $sum: "$revenue" },
        totalUnits: { $sum: "$units" },
        totalOrders: { $sum: "$orders" },
        points: {
          $push: {
            label: "$label",
            revenue: "$revenue",
            units: "$units",
            orders: "$orders",
          },
        },
      },
    },
    { $match: { totalUnits: { $gt: 0 } } },
    {
      $sort: {
        totalRevenue: -1,
        totalUnits: -1,
        latestPaidAt: -1,
        variantId: 1,
      },
    },
    { $limit: lim },
    {
      $lookup: {
        from: "products",
        localField: "productId",
        foreignField: "_id",
        as: "catalogProduct",
      },
    },
    {
      $lookup: {
        from: "productvariants",
        localField: "variantId",
        foreignField: "_id",
        as: "catalogVariant",
      },
    },
    {
      $project: {
        _id: 0,
        productId: 1,
        variantId: 1,
        productName: {
          $cond: [
            {
              $and: [
                { $ne: ["$productNameSnapshot", null] },
                { $ne: ["$productNameSnapshot", ""] },
              ],
            },
            "$productNameSnapshot",
            {
              $ifNull: [
                { $arrayElemAt: ["$catalogProduct.name", 0] },
                {
                  $concat: [
                    "Deleted product · ",
                    { $substrBytes: [{ $toString: "$productId" }, 18, 6] },
                  ],
                },
              ],
            },
          ],
        },
        variantName: {
          $cond: [
            {
              $and: [
                { $ne: ["$variantNameSnapshot", null] },
                { $ne: ["$variantNameSnapshot", ""] },
              ],
            },
            "$variantNameSnapshot",
            {
              $ifNull: [
                { $arrayElemAt: ["$catalogVariant.name", 0] },
                {
                  $concat: [
                    "Deleted variant · ",
                    { $substrBytes: [{ $toString: "$variantId" }, 18, 6] },
                  ],
                },
              ],
            },
          ],
        },
        sku: {
          $cond: [
            {
              $and: [
                { $ne: ["$skuSnapshot", null] },
                { $ne: ["$skuSnapshot", ""] },
              ],
            },
            "$skuSnapshot",
            {
              $ifNull: [
                { $arrayElemAt: ["$catalogVariant.sku", 0] },
                "Unknown SKU",
              ],
            },
          ],
        },
        catalogStatus: {
          $ifNull: [
            { $arrayElemAt: ["$catalogVariant.status", 0] },
            "deleted",
          ],
        },
        totalRevenue: 1,
        totalUnits: 1,
        totalOrders: 1,
        points: 1,
      },
    },
  ]);

  const expectedLabels = buildExpectedSeriesLabels({
    interval: normalizedInterval,
    range,
    from,
    to,
    timeZone,
  });
  const labels =
    expectedLabels.length > 0
      ? expectedLabels
      : Array.from(
          new Set(
            (rows || []).flatMap((row) =>
              (row.points || []).map((point) => point.label),
            ),
          ),
        ).sort((left, right) => String(left).localeCompare(String(right)));

  const variants = (rows || []).map((row) => {
    const pointsByLabel = new Map(
      (row.points || []).map((point) => [point.label, point]),
    );
    const points = labels.map((label) => {
      const source = pointsByLabel.get(label) || {};
      const revenue = Number(source.revenue) || 0;
      const units = Number(source.units) || 0;
      const orders = Number(source.orders) || 0;

      return {
        label,
        revenue,
        units,
        orders,
        realisedSellingPrice: units > 0 ? revenue / units : 0,
      };
    });

    const totalRevenue = Number(row.totalRevenue) || 0;
    const totalUnits = Number(row.totalUnits) || 0;
    const totalOrders = Number(row.totalOrders) || 0;

    return {
      productId: row.productId,
      variantId: row.variantId,
      productName: row.productName,
      variantName: row.variantName,
      sku: row.sku,
      catalogStatus: row.catalogStatus,
      totalRevenue,
      totalUnits,
      totalOrders,
      realisedSellingPrice: totalUnits > 0 ? totalRevenue / totalUnits : 0,
      points,
    };
  });

  const parsedPeriod = parseDateRange({ range, from, to, timeZone });
  const period =
    parsedPeriod.start && parsedPeriod.end
      ? {
          from: formatYmdInTimeZone(parsedPeriod.start, timeZone),
          to: formatYmdInTimeZone(parsedPeriod.end, timeZone),
          timeZone: parsedPeriod.timeZone,
        }
      : null;

  return {
    success: true,
    data: {
      interval: normalizedInterval,
      period,
      variants,
      metricBasis: {
        ranking:
          "Variants are selected by collected merchandise revenue in the selected period.",
        revenue:
          "Collected merchandise revenue after proportional order discounts; excludes delivery fees and item-unattributed refunds.",
        units:
          "Historical units on collected orders, including partially-paid orders.",
        identity:
          "Variant name and SKU come from immutable order-item snapshots, so deleted or renamed variants remain historically visible.",
      },
    },
  };
}

async function GetProductTrends({
  range,
  from,
  to,
  interval,
  limit = 5,
  orderSource,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
} = {}) {
  const isUnbounded =
    !from &&
    !to &&
    (range === undefined || range === "all");
  const normalizedInterval = normalizeRevenueInterval(
    interval || (isUnbounded ? "month" : "week"),
  );

  if (isUnbounded && ["day", "week"].includes(normalizedInterval)) {
    return {
      success: false,
      statusCode: 400,
      message:
        "All-time analytics require a monthly or yearly time-series interval.",
    };
  }

  const bucketCount = estimateRevenueSeriesBucketCount({
    interval: normalizedInterval,
    range,
    from,
    to,
    timeZone,
  });

  if (bucketCount > MAX_REVENUE_SERIES_BUCKETS) {
    return {
      success: false,
      statusCode: 400,
      message: `Requested time series contains ${bucketCount} buckets; maximum is ${MAX_REVENUE_SERIES_BUCKETS}. Use a coarser interval or a shorter date range.`,
    };
  }

  const salesMatch = buildSalesOrderMatch({
    range,
    from,
    to,
    orderSource,
    timeZone,
  });
  const lim = Math.max(1, Math.min(Number(limit) || 5, 10));
  const seriesStages = buildRevenueSeriesStages(
    normalizedInterval,
    range,
    {
      dateExpression: EFFECTIVE_PAID_AT_EXPRESSION,
      timeZone,
    },
  );

  const rows = await Order.aggregate([
    { $match: salesMatch },
    { $addFields: { _analyticsPaidAt: EFFECTIVE_PAID_AT_EXPRESSION } },
    { $sort: { _analyticsPaidAt: -1, createdAt: -1 } },
    { $unwind: "$items" },
    { $addFields: { _analyticsLineRevenue: PRODUCT_LINE_REVENUE_EXPRESSION } },
    {
      $group: {
        _id: {
          product: "$items.product",
          ...seriesStages.groupId,
        },
        productNameSnapshot: { $first: "$items.productName" },
        latestPaidAt: { $first: "$_analyticsPaidAt" },
        revenue: { $sum: "$_analyticsLineRevenue" },
        units: { $sum: { $ifNull: ["$items.quantity", 0] } },
        orderIds: { $addToSet: "$_id" },
      },
    },
    {
      $project: {
        ...seriesStages.projectStage,
        productId: "$_id.product",
        productNameSnapshot: 1,
        latestPaidAt: 1,
        revenue: 1,
        units: 1,
        orders: { $size: "$orderIds" },
      },
    },
    { $sort: { latestPaidAt: -1 } },
    {
      $group: {
        _id: "$productId",
        productId: { $first: "$productId" },
        productNameSnapshot: { $first: "$productNameSnapshot" },
        latestPaidAt: { $first: "$latestPaidAt" },
        totalRevenue: { $sum: "$revenue" },
        totalUnits: { $sum: "$units" },
        totalOrders: { $sum: "$orders" },
        points: {
          $push: {
            label: "$label",
            revenue: "$revenue",
            units: "$units",
            orders: "$orders",
          },
        },
      },
    },
    {
      $sort: {
        totalRevenue: -1,
        totalUnits: -1,
        latestPaidAt: -1,
        productId: 1,
      },
    },
    { $limit: lim },
    {
      $lookup: {
        from: "products",
        localField: "productId",
        foreignField: "_id",
        as: "catalogProduct",
      },
    },
    {
      $project: {
        _id: 0,
        productId: 1,
        productName: {
          $cond: [
            {
              $and: [
                { $ne: ["$productNameSnapshot", null] },
                { $ne: ["$productNameSnapshot", ""] },
              ],
            },
            "$productNameSnapshot",
            {
              $ifNull: [
                { $arrayElemAt: ["$catalogProduct.name", 0] },
                {
                  $concat: [
                    "Deleted product · ",
                    {
                      $substrBytes: [{ $toString: "$productId" }, 18, 6],
                    },
                  ],
                },
              ],
            },
          ],
        },
        catalogStatus: {
          $ifNull: [{ $arrayElemAt: ["$catalogProduct.status", 0] }, "deleted"],
        },
        totalRevenue: 1,
        totalUnits: 1,
        totalOrders: 1,
        points: 1,
      },
    },
  ]);

  const expectedLabels = buildExpectedSeriesLabels({
    interval: normalizedInterval,
    range,
    from,
    to,
    timeZone,
  });
  const labels =
    expectedLabels.length > 0
      ? expectedLabels
      : Array.from(
          new Set(
            (rows || []).flatMap((row) =>
              (row.points || []).map((point) => point.label),
            ),
          ),
        ).sort((left, right) => String(left).localeCompare(String(right)));

  const products = (rows || []).map((row) => {
    const pointsByLabel = new Map(
      (row.points || []).map((point) => [point.label, point]),
    );
    const points = labels.map((label) => {
      const source = pointsByLabel.get(label) || {};
      const revenue = Number(source.revenue) || 0;
      const units = Number(source.units) || 0;
      const orders = Number(source.orders) || 0;

      return {
        label,
        revenue,
        units,
        orders,
        averageSellingPrice: units > 0 ? revenue / units : 0,
      };
    });

    const totalRevenue = Number(row.totalRevenue) || 0;
    const totalUnits = Number(row.totalUnits) || 0;
    const totalOrders = Number(row.totalOrders) || 0;

    return {
      productId: row.productId,
      productName: row.productName,
      catalogStatus: row.catalogStatus,
      totalRevenue,
      totalUnits,
      totalOrders,
      averageSellingPrice: totalUnits > 0 ? totalRevenue / totalUnits : 0,
      points,
    };
  });

  const parsedPeriod = parseDateRange({ range, from, to, timeZone });
  const period =
    parsedPeriod.start && parsedPeriod.end
      ? {
          from: formatYmdInTimeZone(parsedPeriod.start, timeZone),
          to: formatYmdInTimeZone(parsedPeriod.end, timeZone),
          timeZone: parsedPeriod.timeZone,
        }
      : null;

  return {
    success: true,
    data: {
      interval: normalizedInterval,
      period,
      products,
      metricBasis: {
        ranking:
          "Products are selected by collected merchandise revenue in the selected period.",
        revenue:
          "Collected merchandise revenue after proportional order discounts; excludes delivery fees and item-unattributed refunds.",
        units:
          "Units on collected orders, including partially-paid orders.",
      },
    },
  };
}

async function GetProductDetail({
  productId,
  range,
  from,
  to,
  interval,
  orderSource,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
} = {}) {
  if (!mongoose.isValidObjectId(productId)) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid product id.",
    };
  }

  const productObjectId = new mongoose.Types.ObjectId(productId);
  const isUnbounded =
    !from &&
    !to &&
    (range === undefined || range === "all");
  const normalizedInterval = normalizeRevenueInterval(
    interval || (isUnbounded ? "month" : "week"),
  );

  if (isUnbounded && ["day", "week"].includes(normalizedInterval)) {
    return {
      success: false,
      statusCode: 400,
      message:
        "All-time analytics require a monthly or yearly time-series interval.",
    };
  }

  const bucketCount = estimateRevenueSeriesBucketCount({
    interval: normalizedInterval,
    range,
    from,
    to,
    timeZone,
  });

  if (bucketCount > MAX_REVENUE_SERIES_BUCKETS) {
    return {
      success: false,
      statusCode: 400,
      message: `Requested time series contains ${bucketCount} buckets; maximum is ${MAX_REVENUE_SERIES_BUCKETS}. Use a coarser interval or a shorter date range.`,
    };
  }

  const salesMatch = buildSalesOrderMatch({
    range,
    from,
    to,
    orderSource,
    timeZone,
  });
  const seriesStages = buildRevenueSeriesStages(
    normalizedInterval,
    range,
    {
      dateExpression: EFFECTIVE_PAID_AT_EXPRESSION,
      timeZone,
    },
  );

  const detailPromise = Order.aggregate([
    {
      $match: {
        ...salesMatch,
        "items.product": productObjectId,
      },
    },
    {
      $addFields: {
        _analyticsPaidAt: EFFECTIVE_PAID_AT_EXPRESSION,
        _analyticsChannel: SALES_CHANNEL_EXPRESSION,
      },
    },
    { $sort: { _analyticsPaidAt: -1, createdAt: -1 } },
    { $unwind: "$items" },
    { $match: { "items.product": productObjectId } },
    { $addFields: { _analyticsLineRevenue: PRODUCT_LINE_REVENUE_EXPRESSION } },
    {
      $group: {
        _id: {
          order: "$_id",
          variant: "$items.variant",
          channel: "$_analyticsChannel",
          ...seriesStages.groupId,
        },
        productNameSnapshot: { $first: "$items.productName" },
        variantNameSnapshot: { $first: "$items.name" },
        skuSnapshot: { $first: "$items.sku" },
        latestPaidAt: { $first: "$_analyticsPaidAt" },
        revenue: { $sum: "$_analyticsLineRevenue" },
        units: { $sum: { $ifNull: ["$items.quantity", 0] } },
      },
    },
    {
      $project: {
        ...seriesStages.projectStage,
        orderId: "$_id.order",
        variantId: "$_id.variant",
        channel: "$_id.channel",
        productNameSnapshot: 1,
        variantNameSnapshot: 1,
        skuSnapshot: 1,
        latestPaidAt: 1,
        revenue: 1,
        units: 1,
      },
    },
    { $sort: { latestPaidAt: -1 } },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              productNameSnapshot: { $first: "$productNameSnapshot" },
              totalRevenue: { $sum: "$revenue" },
              totalUnits: { $sum: "$units" },
              orderIds: { $addToSet: "$orderId" },
            },
          },
          {
            $project: {
              _id: 0,
              productNameSnapshot: 1,
              totalRevenue: 1,
              totalUnits: 1,
              totalOrders: { $size: "$orderIds" },
            },
          },
        ],
        variants: [
          {
            $group: {
              _id: "$variantId",
              name: { $first: "$variantNameSnapshot" },
              sku: { $first: "$skuSnapshot" },
              revenue: { $sum: "$revenue" },
              quantity: { $sum: "$units" },
              orderIds: { $addToSet: "$orderId" },
            },
          },
          {
            $project: {
              _id: 0,
              variantId: "$_id",
              name: 1,
              sku: 1,
              revenue: 1,
              quantity: 1,
              orderCount: { $size: "$orderIds" },
            },
          },
          { $sort: { revenue: -1, quantity: -1, name: 1 } },
        ],
        sources: [
          {
            $group: {
              _id: "$channel",
              revenue: { $sum: "$revenue" },
              units: { $sum: "$units" },
              orderIds: { $addToSet: "$orderId" },
            },
          },
          {
            $project: {
              _id: 0,
              key: "$_id",
              revenue: 1,
              units: 1,
              orders: { $size: "$orderIds" },
            },
          },
        ],
        trends: [
          {
            $group: {
              _id: "$label",
              revenue: { $sum: "$revenue" },
              units: { $sum: "$units" },
              orderIds: { $addToSet: "$orderId" },
            },
          },
          {
            $project: {
              _id: 0,
              label: "$_id",
              revenue: 1,
              units: 1,
              orders: { $size: "$orderIds" },
            },
          },
          { $sort: { label: 1 } },
        ],
      },
    },
  ]);

  const contributionTotalsPromise = Order.aggregate([
    { $match: salesMatch },
    { $unwind: "$items" },
    { $addFields: { _analyticsLineRevenue: PRODUCT_LINE_REVENUE_EXPRESSION } },
    {
      $group: {
        _id: "$items.product",
        revenue: { $sum: "$_analyticsLineRevenue" },
        units: { $sum: { $ifNull: ["$items.quantity", 0] } },
      },
    },
    { $match: { units: { $gt: 0 } } },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$revenue" },
        totalUnits: { $sum: "$units" },
      },
    },
  ]);

  const [detailRows, contributionRows, catalogProduct, historicalOrder] =
    await Promise.all([
      detailPromise,
      contributionTotalsPromise,
      Product.findById(productObjectId).select("name status").lean(),
      Order.exists({ "items.product": productObjectId }),
    ]);

  if (!catalogProduct && !historicalOrder) {
    return {
      success: false,
      statusCode: 404,
      message: "Product not found.",
    };
  }

  const detail = detailRows?.[0] || {};
  const summary = detail.summary?.[0] || {};
  const contributionTotals = contributionRows?.[0] || {};
  const totalRevenue = Number(summary.totalRevenue) || 0;
  const totalUnits = Number(summary.totalUnits) || 0;
  const totalOrders = Number(summary.totalOrders) || 0;
  const allProductRevenue = Number(contributionTotals.totalRevenue) || 0;
  const allProductUnits = Number(contributionTotals.totalUnits) || 0;

  let historicalName = summary.productNameSnapshot;
  if (
    (!historicalName || typeof historicalName !== "string") &&
    !catalogProduct &&
    historicalOrder
  ) {
    const [identity] = await Order.aggregate([
      { $match: { "items.product": productObjectId } },
      { $addFields: { _analyticsPaidAt: EFFECTIVE_PAID_AT_EXPRESSION } },
      { $sort: { _analyticsPaidAt: -1, createdAt: -1 } },
      { $unwind: "$items" },
      { $match: { "items.product": productObjectId } },
      {
        $project: {
          _id: 0,
          productNameSnapshot: "$items.productName",
        },
      },
      { $limit: 1 },
    ]);
    historicalName = identity?.productNameSnapshot;
  }

  const productName =
    (typeof historicalName === "string" && historicalName.trim()) ||
    catalogProduct?.name ||
    `Deleted product · ${String(productObjectId).slice(-6)}`;

  const variants = (detail.variants || []).map((variant) => {
    const revenue = Number(variant.revenue) || 0;
    const quantity = Number(variant.quantity) || 0;
    const orderCount = Number(variant.orderCount) || 0;

    return {
      ...variant,
      revenue,
      quantity,
      orderCount,
      averageSellingPrice: quantity > 0 ? revenue / quantity : 0,
      averageRevenuePerOrder: orderCount > 0 ? revenue / orderCount : 0,
      averageUnitsPerOrder: orderCount > 0 ? quantity / orderCount : 0,
      revenueContributionPercent: roundPercentage(revenue, totalRevenue),
      unitContributionPercent: roundPercentage(quantity, totalUnits),
    };
  });

  const sourceRows = new Map(
    (detail.sources || []).map((source) => [source.key, source]),
  );
  const sourceSplit = SALES_CHANNELS.map((key) => {
    const source = sourceRows.get(key) || {};
    const revenue = Number(source.revenue) || 0;
    const units = Number(source.units) || 0;
    const orders = Number(source.orders) || 0;

    return {
      key,
      label: SALES_CHANNEL_LABELS[key] || key,
      revenue,
      units,
      orders,
      averageSellingPrice: units > 0 ? revenue / units : 0,
      revenueContributionPercent: roundPercentage(revenue, totalRevenue),
      unitContributionPercent: roundPercentage(units, totalUnits),
    };
  });

  const expectedLabels = buildExpectedSeriesLabels({
    interval: normalizedInterval,
    range,
    from,
    to,
    timeZone,
  });
  const sparseTrend = new Map(
    (detail.trends || []).map((point) => [point.label, point]),
  );
  const labels =
    expectedLabels.length > 0
      ? expectedLabels
      : Array.from(sparseTrend.keys()).sort((left, right) =>
          String(left).localeCompare(String(right)),
        );

  const points = labels.map((label) => {
    const point = sparseTrend.get(label) || {};
    const revenue = Number(point.revenue) || 0;
    const units = Number(point.units) || 0;
    const orders = Number(point.orders) || 0;

    return {
      label,
      revenue,
      units,
      orders,
      averageSellingPrice: units > 0 ? revenue / units : 0,
    };
  });

  const parsedPeriod = parseDateRange({ range, from, to, timeZone });
  const period =
    parsedPeriod.start && parsedPeriod.end
      ? {
          from: formatYmdInTimeZone(parsedPeriod.start, timeZone),
          to: formatYmdInTimeZone(parsedPeriod.end, timeZone),
          timeZone: parsedPeriod.timeZone,
        }
      : null;

  return {
    success: true,
    data: {
      productId: productObjectId,
      productName,
      catalogStatus: catalogProduct?.status || "deleted",
      period,
      totalRevenue,
      totalUnits,
      totalOrders,
      averageSellingPrice: totalUnits > 0 ? totalRevenue / totalUnits : 0,
      averageRevenuePerOrder: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      averageUnitsPerOrder: totalOrders > 0 ? totalUnits / totalOrders : 0,
      revenueContributionPercent: roundPercentage(
        totalRevenue,
        allProductRevenue,
      ),
      unitContributionPercent: roundPercentage(totalUnits, allProductUnits),
      variants,
      sourceSplit,
      trend: {
        interval: normalizedInterval,
        points,
      },
      metricBasis: {
        revenue:
          "Collected merchandise revenue after proportional order discounts; excludes delivery fees and item-unattributed refunds.",
        units:
          "Units on collected orders, including partially-paid orders.",
        contribution:
          "Share of collected product revenue or units across products with at least one sold unit in the selected period.",
        source:
          "Source classification is mutually exclusive: Website One-Time, Subscription, or Imported.",
      },
    },
  };
}

async function GetVariantDetail({
  variantId,
  range,
  from,
  to,
  interval,
  orderSource,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
} = {}) {
  if (!mongoose.isValidObjectId(variantId)) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid variant id.",
    };
  }

  const variantObjectId = new mongoose.Types.ObjectId(variantId);
  const isUnbounded =
    !from &&
    !to &&
    (range === undefined || range === "all");
  const normalizedInterval = normalizeRevenueInterval(
    interval || (isUnbounded ? "month" : "week"),
  );

  if (isUnbounded && ["day", "week"].includes(normalizedInterval)) {
    return {
      success: false,
      statusCode: 400,
      message:
        "All-time analytics require a monthly or yearly time-series interval.",
    };
  }

  const bucketCount = estimateRevenueSeriesBucketCount({
    interval: normalizedInterval,
    range,
    from,
    to,
    timeZone,
  });

  if (bucketCount > MAX_REVENUE_SERIES_BUCKETS) {
    return {
      success: false,
      statusCode: 400,
      message: `Requested time series contains ${bucketCount} buckets; maximum is ${MAX_REVENUE_SERIES_BUCKETS}. Use a coarser interval or a shorter date range.`,
    };
  }

  const salesMatch = buildSalesOrderMatch({
    range,
    from,
    to,
    orderSource,
    timeZone,
  });
  const seriesStages = buildRevenueSeriesStages(
    normalizedInterval,
    range,
    {
      dateExpression: EFFECTIVE_PAID_AT_EXPRESSION,
      timeZone,
    },
  );

  const detailPromise = Order.aggregate([
    {
      $match: {
        ...salesMatch,
        "items.variant": variantObjectId,
      },
    },
    {
      $addFields: {
        _analyticsPaidAt: EFFECTIVE_PAID_AT_EXPRESSION,
        _analyticsChannel: SALES_CHANNEL_EXPRESSION,
      },
    },
    { $sort: { _analyticsPaidAt: -1, createdAt: -1 } },
    { $unwind: "$items" },
    { $match: { "items.variant": variantObjectId } },
    { $addFields: { _analyticsLineRevenue: PRODUCT_LINE_REVENUE_EXPRESSION } },
    {
      $group: {
        _id: {
          order: "$_id",
          channel: "$_analyticsChannel",
          ...seriesStages.groupId,
        },
        productIdSnapshot: { $first: "$items.product" },
        productNameSnapshot: { $first: "$items.productName" },
        variantNameSnapshot: { $first: "$items.name" },
        skuSnapshot: { $first: "$items.sku" },
        latestPaidAt: { $first: "$_analyticsPaidAt" },
        revenue: { $sum: "$_analyticsLineRevenue" },
        units: { $sum: { $ifNull: ["$items.quantity", 0] } },
      },
    },
    {
      $project: {
        ...seriesStages.projectStage,
        orderId: "$_id.order",
        channel: "$_id.channel",
        productIdSnapshot: 1,
        productNameSnapshot: 1,
        variantNameSnapshot: 1,
        skuSnapshot: 1,
        latestPaidAt: 1,
        revenue: 1,
        units: 1,
      },
    },
    { $sort: { latestPaidAt: -1 } },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              productIdSnapshot: { $first: "$productIdSnapshot" },
              productNameSnapshot: { $first: "$productNameSnapshot" },
              variantNameSnapshot: { $first: "$variantNameSnapshot" },
              skuSnapshot: { $first: "$skuSnapshot" },
              totalRevenue: { $sum: "$revenue" },
              totalUnits: { $sum: "$units" },
              orderIds: { $addToSet: "$orderId" },
            },
          },
          {
            $project: {
              _id: 0,
              productIdSnapshot: 1,
              productNameSnapshot: 1,
              variantNameSnapshot: 1,
              skuSnapshot: 1,
              totalRevenue: 1,
              totalUnits: 1,
              totalOrders: { $size: "$orderIds" },
            },
          },
        ],
        sources: [
          {
            $group: {
              _id: "$channel",
              revenue: { $sum: "$revenue" },
              units: { $sum: "$units" },
              orderIds: { $addToSet: "$orderId" },
            },
          },
          {
            $project: {
              _id: 0,
              key: "$_id",
              revenue: 1,
              units: 1,
              orders: { $size: "$orderIds" },
            },
          },
        ],
        trends: [
          {
            $group: {
              _id: "$label",
              revenue: { $sum: "$revenue" },
              units: { $sum: "$units" },
              orderIds: { $addToSet: "$orderId" },
            },
          },
          {
            $project: {
              _id: 0,
              label: "$_id",
              revenue: 1,
              units: 1,
              orders: { $size: "$orderIds" },
            },
          },
          { $sort: { label: 1 } },
        ],
      },
    },
  ]);

  const contributionTotalsPromise = Order.aggregate([
    { $match: salesMatch },
    { $unwind: "$items" },
    { $addFields: { _analyticsLineRevenue: PRODUCT_LINE_REVENUE_EXPRESSION } },
    {
      $group: {
        _id: "$items.variant",
        revenue: { $sum: "$_analyticsLineRevenue" },
        units: { $sum: { $ifNull: ["$items.quantity", 0] } },
      },
    },
    { $match: { units: { $gt: 0 } } },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$revenue" },
        totalUnits: { $sum: "$units" },
      },
    },
  ]);

  const [detailRows, contributionRows, catalogVariant, historicalOrder] =
    await Promise.all([
      detailPromise,
      contributionTotalsPromise,
      ProductVariant.findById(variantObjectId)
        .select("product name sku status price")
        .lean(),
      Order.exists({ "items.variant": variantObjectId }),
    ]);

  if (!catalogVariant && !historicalOrder) {
    return {
      success: false,
      statusCode: 404,
      message: "Variant not found.",
    };
  }

  const detail = detailRows?.[0] || {};
  const summary = detail.summary?.[0] || {};
  const contributionTotals = contributionRows?.[0] || {};
  const totalRevenue = Number(summary.totalRevenue) || 0;
  const totalUnits = Number(summary.totalUnits) || 0;
  const totalOrders = Number(summary.totalOrders) || 0;
  const allVariantRevenue = Number(contributionTotals.totalRevenue) || 0;
  const allVariantUnits = Number(contributionTotals.totalUnits) || 0;

  let historicalIdentity = {
    productId: summary.productIdSnapshot,
    productName: summary.productNameSnapshot,
    variantName: summary.variantNameSnapshot,
    sku: summary.skuSnapshot,
  };

  if (
    (!historicalIdentity.variantName ||
      !historicalIdentity.sku ||
      !historicalIdentity.productId) &&
    historicalOrder
  ) {
    const [identity] = await Order.aggregate([
      { $match: { "items.variant": variantObjectId } },
      { $addFields: { _analyticsPaidAt: EFFECTIVE_PAID_AT_EXPRESSION } },
      { $sort: { _analyticsPaidAt: -1, createdAt: -1 } },
      { $unwind: "$items" },
      { $match: { "items.variant": variantObjectId } },
      {
        $project: {
          _id: 0,
          productId: "$items.product",
          productName: "$items.productName",
          variantName: "$items.name",
          sku: "$items.sku",
        },
      },
      { $limit: 1 },
    ]);

    if (identity) historicalIdentity = { ...historicalIdentity, ...identity };
  }

  const productId =
    historicalIdentity.productId || catalogVariant?.product || null;
  const catalogProduct = productId
    ? await Product.findById(productId).select("name status").lean()
    : null;

  const productName =
    (typeof historicalIdentity.productName === "string" &&
      historicalIdentity.productName.trim()) ||
    catalogProduct?.name ||
    (productId ? `Deleted product · ${String(productId).slice(-6)}` : "Unknown product");
  const variantName =
    (typeof historicalIdentity.variantName === "string" &&
      historicalIdentity.variantName.trim()) ||
    catalogVariant?.name ||
    `Deleted variant · ${String(variantObjectId).slice(-6)}`;
  const sku =
    (typeof historicalIdentity.sku === "string" &&
      historicalIdentity.sku.trim()) ||
    catalogVariant?.sku ||
    "Unknown SKU";

  const currentPrice =
    catalogVariant?.price === null || catalogVariant?.price === undefined
      ? null
      : Number(catalogVariant.price);
  const realisedSellingPrice =
    totalUnits > 0 ? totalRevenue / totalUnits : 0;
  const priceDifference =
    currentPrice === null || totalUnits <= 0
      ? null
      : realisedSellingPrice - currentPrice;
  const priceDifferencePercent =
    priceDifference !== null && currentPrice > 0
      ? Math.round((priceDifference / currentPrice) * 10000) / 100
      : null;

  const sourceRows = new Map(
    (detail.sources || []).map((source) => [source.key, source]),
  );
  const sourceSplit = SALES_CHANNELS.map((key) => {
    const source = sourceRows.get(key) || {};
    const revenue = Number(source.revenue) || 0;
    const units = Number(source.units) || 0;
    const orders = Number(source.orders) || 0;

    return {
      key,
      label: SALES_CHANNEL_LABELS[key] || key,
      revenue,
      units,
      orders,
      realisedSellingPrice: units > 0 ? revenue / units : 0,
      revenueContributionPercent: roundPercentage(revenue, totalRevenue),
      unitContributionPercent: roundPercentage(units, totalUnits),
    };
  });

  const expectedLabels = buildExpectedSeriesLabels({
    interval: normalizedInterval,
    range,
    from,
    to,
    timeZone,
  });
  const sparseTrend = new Map(
    (detail.trends || []).map((point) => [point.label, point]),
  );
  const labels =
    expectedLabels.length > 0
      ? expectedLabels
      : Array.from(sparseTrend.keys()).sort((left, right) =>
          String(left).localeCompare(String(right)),
        );

  const points = labels.map((label) => {
    const point = sparseTrend.get(label) || {};
    const revenue = Number(point.revenue) || 0;
    const units = Number(point.units) || 0;
    const orders = Number(point.orders) || 0;

    return {
      label,
      revenue,
      units,
      orders,
      realisedSellingPrice: units > 0 ? revenue / units : 0,
    };
  });

  const parsedPeriod = parseDateRange({ range, from, to, timeZone });
  const period =
    parsedPeriod.start && parsedPeriod.end
      ? {
          from: formatYmdInTimeZone(parsedPeriod.start, timeZone),
          to: formatYmdInTimeZone(parsedPeriod.end, timeZone),
          timeZone: parsedPeriod.timeZone,
        }
      : null;

  return {
    success: true,
    data: {
      productId,
      variantId: variantObjectId,
      productName,
      variantName,
      sku,
      catalogStatus: catalogVariant?.status || "deleted",
      currentPrice,
      period,
      totalRevenue,
      totalUnits,
      totalOrders,
      realisedSellingPrice,
      averageRevenuePerOrder:
        totalOrders > 0 ? totalRevenue / totalOrders : 0,
      averageUnitsPerOrder:
        totalOrders > 0 ? totalUnits / totalOrders : 0,
      revenueContributionPercent: roundPercentage(
        totalRevenue,
        allVariantRevenue,
      ),
      unitContributionPercent: roundPercentage(totalUnits, allVariantUnits),
      priceDifference,
      priceDifferencePercent,
      sourceSplit,
      trend: {
        interval: normalizedInterval,
        points,
      },
      metricBasis: {
        revenue:
          "Collected merchandise revenue after proportional order discounts; excludes delivery fees and item-unattributed refunds.",
        units:
          "Historical units on collected orders, including partially-paid orders.",
        contribution:
          "Share of collected variant revenue or historical units across variants with at least one sold unit in the selected period.",
        realisedSellingPrice:
          "Collected merchandise revenue divided by historical units sold.",
        currentPrice:
          "Current catalog variant price at request time; deleted variants have no current-price comparison.",
        source:
          "Source classification is mutually exclusive: Website One-Time, Subscription, or Imported.",
        identity:
          "Variant name and SKU come from immutable order-item snapshots, so deleted or renamed variants remain historically visible.",
      },
    },
  };
}

async function GetRecentOrders({
  range,
  from,
  to,
  limit = 5,
  orderSource,
} = {}) {
  const orderMatch = buildOrderMatch({ range, from, to, orderSource });
  const lim = Math.max(1, Math.min(Number(limit) || 5, 25));

  const orders = await Order.find({
    ...orderMatch,
    status: {
      $in: ANALYTICS_ORDER_STATUSES,
    },
  })
    .populate({ path: "customer", select: "firstName lastName email phone" })
    .sort({ createdAt: -1 })
    .limit(lim)
    .lean();

  return {
    success: true,
    data: {
      orders,
    },
  };
}

async function GetLowStock({ limit = 50 } = {}) {
  const lim = Math.max(1, Math.min(Number(limit) || 50, 200));

  // Can't compute `stockQuantity - reservedQuantity <= lowStockAlert` in a plain query.
  // So we aggregate.
  const items = await ProductVariant.aggregate([
    { $match: { status: "active" } },
    STOCK_AVAILABLE_ADD_FIELDS,
    LOW_STOCK_MATCH,
    { $sort: { available: 1 } },
    { $limit: lim },
    STOCK_PRODUCT_LOOKUP,
    STOCK_PRODUCT_UNWIND,
    ...STOCK_DEDUP_STAGES,
    STOCK_ITEM_PROJECT,
  ]);

  return {
    success: true,
    data: {
      items,
    },
  };
}

async function GetOutOfStock({ limit = 50 } = {}) {
  const lim = Math.max(1, Math.min(Number(limit) || 50, 200));

  const items = await ProductVariant.aggregate([
    { $match: { status: "active" } },
    STOCK_AVAILABLE_ADD_FIELDS,
    OUT_OF_STOCK_MATCH,
    { $sort: { available: 1 } },
    { $limit: lim },
    STOCK_PRODUCT_LOOKUP,
    STOCK_PRODUCT_UNWIND,
    ...STOCK_DEDUP_STAGES,
    STOCK_ITEM_PROJECT,
  ]);

  return {
    success: true,
    data: {
      items,
    },
  };
}

async function GetCancelledSubscriptions({
  range,
  from,
  to,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
} = {}) {
  const parsedPeriod = parseDateRange({ range, from, to, timeZone });
  if (parsedPeriod.invalid) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid analytics date range.",
    };
  }

  const cancelledAtMatch = buildEventDateMatch({
    range,
    from,
    to,
    field: "cancelledAt",
    timeZone,
  });
  const cancelledSubscriptions = await Subscription.countDocuments({
    status: "cancelled",
    ...(Object.keys(cancelledAtMatch).length > 0
      ? cancelledAtMatch
      : { cancelledAt: { $ne: null } }),
  });
  const period =
    parsedPeriod.start && parsedPeriod.end
      ? {
          from: formatYmdInTimeZone(parsedPeriod.start, timeZone),
          to: formatYmdInTimeZone(parsedPeriod.end, timeZone),
          timeZone: parsedPeriod.timeZone,
        }
      : null;

  return {
    success: true,
    data: {
      cancelledSubscriptions,
      period,
      metricBasis: {
        cancelledSubscriptions:
          "Effective subscription cancellations whose cancelledAt timestamp falls inside the selected analytics date range. Scheduled cancellations are excluded until they become effective.",
        source:
          "Order-source filters do not apply because cancellation is subscription lifecycle data, not an order sales channel.",
      },
    },
  };
}

async function GetNewSubscriptions({
  range,
  from,
  to,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
} = {}) {
  const parsedPeriod = parseDateRange({ range, from, to, timeZone });
  if (parsedPeriod.invalid) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid analytics date range.",
    };
  }

  const createdAtMatch = buildCreatedAtMatch({
    range,
    from,
    to,
    timeZone,
  });
  const newSubscriptions = await Subscription.countDocuments(createdAtMatch);
  const period =
    parsedPeriod.start && parsedPeriod.end
      ? {
          from: formatYmdInTimeZone(parsedPeriod.start, timeZone),
          to: formatYmdInTimeZone(parsedPeriod.end, timeZone),
          timeZone: parsedPeriod.timeZone,
        }
      : null;

  return {
    success: true,
    data: {
      newSubscriptions,
      period,
      metricBasis: {
        newSubscriptions:
          "Subscriptions whose immutable creation timestamp falls inside the selected analytics date range, regardless of their current lifecycle status.",
        source:
          "Order-source filters do not apply because subscription creation is lifecycle data, not an order sales channel.",
      },
    },
  };
}

const SUBSCRIPTION_DELIVERY_FEE = 1;

async function GetCurrentSubscriptionSnapshot() {
  const [row = {}] = await Subscription.aggregate([
    {
      $match: {
        status: "active",
        isCancellationScheduled: { $ne: true },
      },
    },
    {
      $addFields: {
        _analyticsMerchandiseValue: {
          $sum: {
            $map: {
              input: { $ifNull: ["$items", []] },
              as: "item",
              in: {
                $multiply: [
                  { $ifNull: ["\u0024\u0024item.unitPrice", 0] },
                  { $ifNull: ["\u0024\u0024item.quantity", 0] },
                ],
              },
            },
          },
        },
        _analyticsDeliveryCount: {
          $cond: [
            { $eq: ["$frequency", "weekly"] },
            {
              $max: [
                1,
                { $size: { $ifNull: ["$preferredDeliveryDays", []] } },
              ],
            },
            1,
          ],
        },
      },
    },
    {
      $addFields: {
        _analyticsDeliveryFeeValue: {
          $multiply: [
            "$_analyticsDeliveryCount",
            SUBSCRIPTION_DELIVERY_FEE,
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        activeSubscriptions: { $sum: 1 },
        totalMerchandiseValue: { $sum: "$_analyticsMerchandiseValue" },
        totalDeliveryFeeValue: { $sum: "$_analyticsDeliveryFeeValue" },
        totalRecurringCharge: {
          $sum: {
            $add: [
              "$_analyticsMerchandiseValue",
              "$_analyticsDeliveryFeeValue",
            ],
          },
        },
      },
    },
  ]);

  return {
    activeSubscriptions: Number(row.activeSubscriptions) || 0,
    totalMerchandiseValue: Number(row.totalMerchandiseValue) || 0,
    totalDeliveryFeeValue: Number(row.totalDeliveryFeeValue) || 0,
    totalRecurringCharge: Number(row.totalRecurringCharge) || 0,
  };
}

const buildActiveSubscriptionsData = (snapshot = {}) => ({
  activeSubscriptions: Number(snapshot.activeSubscriptions) || 0,
  metricBasis: {
    activeSubscriptions:
      "Current subscriptions eligible to continue recurring service: status is active and cancellation is not scheduled. Paused, cancelled, and scheduled-cancellation subscriptions are excluded.",
    scope:
      "Point-in-time current state at request time; historical date and order-source filters do not apply because subscription status history is not stored as snapshots.",
  },
});

const buildAverageSubscriptionValueData = (snapshot = {}) => {
  const activeSubscriptions = Number(snapshot.activeSubscriptions) || 0;
  const totalRecurringCharge = Number(snapshot.totalRecurringCharge) || 0;
  const totalMerchandiseValue = Number(snapshot.totalMerchandiseValue) || 0;
  const totalDeliveryFeeValue = Number(snapshot.totalDeliveryFeeValue) || 0;

  return {
    averageSubscriptionValue:
      activeSubscriptions > 0 ? totalRecurringCharge / activeSubscriptions : 0,
    averageMerchandiseValue:
      activeSubscriptions > 0 ? totalMerchandiseValue / activeSubscriptions : 0,
    averageDeliveryFeeValue:
      activeSubscriptions > 0
        ? totalDeliveryFeeValue / activeSubscriptions
        : 0,
    totalRecurringCharge,
    activeSubscriptions,
    metricBasis: {
      averageSubscriptionValue:
        "Current average recurring charge per billing cycle across subscriptions eligible to continue recurring service. It uses each subscription's effective item price snapshots plus the same £1-per-delivery fee structure used by recurring billing.",
      scope:
        "Point-in-time current subscription state. Pending post-cutoff changes are excluded until they become effective; historical date and order-source filters do not apply.",
    },
  };
};

async function GetActiveSubscriptions() {
  const snapshot = await GetCurrentSubscriptionSnapshot();

  return {
    success: true,
    data: buildActiveSubscriptionsData(snapshot),
  };
}

async function GetAverageSubscriptionValue() {
  const snapshot = await GetCurrentSubscriptionSnapshot();

  return {
    success: true,
    data: buildAverageSubscriptionValueData(snapshot),
  };
}

async function GetDashboard({
  range,
  from,
  to,
  interval,
  orderSource,
  comparison = "previous_period",
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
} = {}) {
  const currentSubscriptionSnapshotPromise = GetCurrentSubscriptionSnapshot();
  const activeSubscriptionsPromise = currentSubscriptionSnapshotPromise.then(
    (snapshot) => ({
      success: true,
      data: buildActiveSubscriptionsData(snapshot),
    }),
  );
  const averageSubscriptionValuePromise =
    currentSubscriptionSnapshotPromise.then((snapshot) => ({
      success: true,
      data: buildAverageSubscriptionValueData(snapshot),
    }));
  const cancelledSubscriptionsPromise = GetCancelledSubscriptions({
    range,
    from,
    to,
    timeZone,
  });
  const newSubscriptionsPromise = GetNewSubscriptions({
    range,
    from,
    to,
    timeZone,
  });
  const stockSnapshotPromise = GetDashboardStockSnapshot({ limit: 50 });
  const stockCountsPromise = stockSnapshotPromise.then(
    (snapshot) => snapshot.data.counts,
  );

  const salesBreakdownPromise = GetSalesBreakdown({
    range,
    from,
    to,
    timeZone,
  });
  const isAllSources = !orderSource || orderSource === "all";
  const performanceMetricsPromise = isAllSources
    ? salesBreakdownPromise.then((breakdown) => ({
        ...breakdown.data.totals,
        revenue: breakdown.data.totals.netRevenue,
      }))
    : null;

  const summaryPromise = GetSummary({
    range,
    from,
    to,
    orderSource,
    timeZone,
    stockCountsPromise,
    performanceMetricsPromise,
  });
  const revenuePromise = GetRevenueSeries({
    range,
    from,
    to,
    interval,
    orderSource,
    timeZone,
  });
  const canReuseRevenueForSubscriptionTrends =
    !orderSource || orderSource === "all" || orderSource === "subscription";
  const subscriptionTrendsPromise = GetSubscriptionTrends({
    range,
    from,
    to,
    interval,
    timeZone,
    revenueSeriesPromise: canReuseRevenueForSubscriptionTrends
      ? revenuePromise
      : undefined,
  });
  const topProductsPromise = GetTopProducts({
    range,
    from,
    to,
    limit: 5,
    orderSource,
    timeZone,
  });
  const productTrendsPromise = GetProductTrends({
    range,
    from,
    to,
    interval,
    limit: 3,
    orderSource,
    timeZone,
  });
  const variantTrendsPromise = GetVariantTrends({
    range,
    from,
    to,
    interval,
    limit: 3,
    orderSource,
    timeZone,
  });
  const variantUnitsPromise = GetVariantUnits({
    range,
    from,
    to,
    limit: 5,
    orderSource,
    timeZone,
  });
  const topSubscriptionProductsVariantsPromise =
    GetTopSubscriptionProductsVariants({
      range,
      from,
      to,
      limit: 5,
      timeZone,
    });
  const recentOrdersPromise = GetRecentOrders({
    range,
    from,
    to,
    limit: 5,
    orderSource,
  });
  // Reuse the current-period financial work already performed by GetSummary.
  // Only the previous period needs an additional comparison query.
  const summary = await summaryPromise;
  const overviewMetrics = {
    netRevenue: summary.data.netRevenue,
    grossRevenue: summary.data.grossRevenue,
    refundAmount: summary.data.refundAmount,
    totalOrders: summary.data.totalOrders,
    unitsSold: summary.data.unitsSold,
    averageOrderValue: summary.data.averageOrderValue,
    averageUnitsPerOrder: summary.data.averageUnitsPerOrder,
  };

  const comparisonPromise = GetSummaryComparison({
    range,
    from,
    to,
    orderSource,
    timeZone,
    currentMetrics: {
      ...overviewMetrics,
      revenue: summary.data.revenue,
    },
    comparison,
  });

  const [
    comparison,
    revenue,
    topProducts,
    productTrends,
    variantTrends,
    variantUnits,
    topSubscriptionProductsVariants,
    activeSubscriptions,
    averageSubscriptionValue,
    newSubscriptions,
    cancelledSubscriptions,
    subscriptionTrends,
    salesBreakdown,
    recentOrders,
    stockSnapshot,
  ] = await Promise.all([
    comparisonPromise,
    revenuePromise,
    topProductsPromise,
    productTrendsPromise,
    variantTrendsPromise,
    variantUnitsPromise,
    topSubscriptionProductsVariantsPromise,
    activeSubscriptionsPromise,
    averageSubscriptionValuePromise,
    newSubscriptionsPromise,
    cancelledSubscriptionsPromise,
    subscriptionTrendsPromise,
    salesBreakdownPromise,
    recentOrdersPromise,
    stockSnapshotPromise,
  ]);

  const failed = [
    comparison,
    revenue,
    topProducts,
    productTrends,
    variantTrends,
    variantUnits,
    topSubscriptionProductsVariants,
    activeSubscriptions,
    averageSubscriptionValue,
    newSubscriptions,
    cancelledSubscriptions,
    subscriptionTrends,
    salesBreakdown,
    recentOrders,
    stockSnapshot,
  ].find((result) => !result?.success);

  if (failed) {
    return {
      success: false,
      statusCode: failed.statusCode || 500,
      message: failed.message || "Analytics dashboard request failed",
    };
  }

  return {
    success: true,
    data: {
      overview: {
        metrics: overviewMetrics,
        comparison: comparison.data,
      },
      // Kept for existing consumers while the analytics UI is migrated.
      summary: summary.data,
      revenue: revenue.data,
      salesTrends: revenue.data.salesTrends,
      revenueComposition: buildRevenueComposition(summary.data),
      topProducts: topProducts.data,
      productTrends: productTrends.data,
      variantTrends: variantTrends.data,
      variantUnits: variantUnits.data,
      variantRevenue: {
        variants: variantUnits.data.byRevenue,
        byRevenue: variantUnits.data.byRevenue,
        totals: {
          totalRevenue: variantUnits.data.totals.totalRevenue,
          variantsSold: variantUnits.data.totals.variantsSold,
        },
        metricBasis: {
          revenue: variantUnits.data.metricBasis.revenue,
          ranking:
            "Variants are ranked by collected merchandise revenue in the selected period.",
          identity: variantUnits.data.metricBasis.identity,
        },
      },
      variantRealisedPrice: {
        variants: variantUnits.data.byRevenue,
        totals: {
          totalRevenue: variantUnits.data.totals.totalRevenue,
          totalUnits: variantUnits.data.totals.totalUnits,
          realisedSellingPrice:
            variantUnits.data.totals.totalUnits > 0
              ? variantUnits.data.totals.totalRevenue /
                variantUnits.data.totals.totalUnits
              : 0,
          variantsSold: variantUnits.data.totals.variantsSold,
        },
        metricBasis: {
          realisedSellingPrice:
            variantUnits.data.metricBasis.realisedSellingPrice,
          identity: variantUnits.data.metricBasis.identity,
        },
      },
      variantPriceComparison: {
        variants: variantUnits.data.byRevenue,
        totals: {
          totalRevenue: variantUnits.data.totals.totalRevenue,
          totalUnits: variantUnits.data.totals.totalUnits,
          realisedSellingPrice:
            variantUnits.data.totals.totalUnits > 0
              ? variantUnits.data.totals.totalRevenue /
                variantUnits.data.totals.totalUnits
              : 0,
          variantsSold: variantUnits.data.totals.variantsSold,
        },
        metricBasis: {
          realisedSellingPrice:
            variantUnits.data.metricBasis.realisedSellingPrice,
          currentPrice: variantUnits.data.metricBasis.currentPrice,
          priceComparison: variantUnits.data.metricBasis.priceComparison,
          identity: variantUnits.data.metricBasis.identity,
        },
      },
      variantSalesMix: {
        variants: variantUnits.data.bySalesMix.map((variant) => ({
          productId: variant.productId,
          variantId: variant.variantId,
          productName: variant.productName,
          variantName: variant.variantName,
          sku: variant.sku,
          catalogStatus: variant.catalogStatus,
          oneTime: variant.oneTime,
          subscription: variant.subscription,
          importedExcluded: variant.importedExcluded,
        })),
        totals: {
          oneTime: variantUnits.data.totals.oneTime,
          subscription: variantUnits.data.totals.subscription,
          importedExcluded: variantUnits.data.totals.importedExcluded,
        },
        metricBasis: {
          salesMix: variantUnits.data.metricBasis.salesMix,
          revenue: variantUnits.data.metricBasis.revenue,
          units: variantUnits.data.metricBasis.units,
          identity: variantUnits.data.metricBasis.identity,
        },
      },
      activeSubscriptions: activeSubscriptions.data,
      averageSubscriptionValue: averageSubscriptionValue.data,
      newSubscriptions: newSubscriptions.data,
      cancelledSubscriptions: cancelledSubscriptions.data,
      subscriptionTrends: subscriptionTrends.data,
      subscriptionRevenue: buildSubscriptionRevenueData(salesBreakdown.data),
      recurringVsOneTime: buildRecurringVsOneTimeData(salesBreakdown.data),
      topSubscriptionProductsVariants: topSubscriptionProductsVariants.data,
      variantContribution: {
        variants: variantUnits.data.byRevenue,
        byRevenue: variantUnits.data.byRevenue,
        byUnits: variantUnits.data.byUnits,
        totals: {
          totalRevenue: variantUnits.data.totals.totalRevenue,
          totalUnits: variantUnits.data.totals.totalUnits,
          variantsSold: variantUnits.data.totals.variantsSold,
        },
        metricBasis: {
          contribution: variantUnits.data.metricBasis.contribution,
          revenue: variantUnits.data.metricBasis.revenue,
          units: variantUnits.data.metricBasis.units,
          identity: variantUnits.data.metricBasis.identity,
        },
      },
      salesBreakdown: salesBreakdown.data,
      recentOrders: recentOrders.data,
      lowStock: stockSnapshot.data.lowStock,
      outOfStock: stockSnapshot.data.outOfStock,
    },
  };
}

module.exports = {
  parseDateRange,
  GetSummary,
  GetSummaryComparison,
  GetPerformanceMetrics,
  GetRevenueComposition,
  GetSalesBreakdown,
  GetRecurringVsOneTime,
  GetSubscriptionRevenue,
  GetTopSubscriptionProductsVariants,
  GetSubscriptionTrends,
  GetSalesTrends,
  GetRevenueSeries,
  GetRevenueOverview,
  GetOrderStatusCounts,
  GetTopProducts,
  GetVariantUnits,
  GetVariantRevenue,
  GetVariantRealisedPrice,
  GetVariantPriceComparison,
  GetVariantSalesMix,
  GetVariantContribution,
  GetVariantTrends,
  GetProductTrends,
  GetProductDetail,
  GetVariantDetail,
  GetActiveSubscriptions,
  GetAverageSubscriptionValue,
  GetNewSubscriptions,
  GetCancelledSubscriptions,
  GetRecentOrders,
  GetLowStock,
  GetOutOfStock,
  GetDashboard,
  GetNavCounts,
};

async function GetNavCounts() {
  const [pendingOrders, pendingReviews] = await Promise.all([
    // Paid orders that haven't been dispatched yet — need admin action
    Order.countDocuments({ status: "paid", deliveryStatus: "ordered" }),
    Review.countDocuments({ isVisible: false }),
  ]);
  return { success: true, data: { pendingOrders, pendingReviews } };
}
