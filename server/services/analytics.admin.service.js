const mongoose = require("mongoose");

const Order = require("../models/order.model");
const Product = require("../models/product.model");
const ProductVariant = require("../models/variant.model");
const Review = require("../models/review.model");

const {
  DEFAULT_ANALYTICS_TIME_ZONE,
  parseDateRange,
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
      collectedFraction: COLLECTED_FRACTION_EXPRESSION,
      collectedDiscount: COLLECTED_DISCOUNT_EXPRESSION,
    },
    in: {
      $max: [
        0,
        {
          $subtract: [
            { $multiply: ["$lineSubtotal", "$collectedFraction"] },
            {
              $cond: [
                { $gt: ["$orderSubtotal", 0] },
                {
                  $multiply: [
                    { $divide: ["$lineSubtotal", "$orderSubtotal"] },
                    "$collectedDiscount",
                  ],
                },
                0,
              ],
            },
          ],
        },
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
} = {}) {
  const periods = resolveComparisonPeriods({
    range,
    from,
    to,
    timeZone,
    now,
  });

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
        },
        productNameSnapshot: { $first: "$items.productName" },
        variantNameSnapshot: { $first: "$items.name" },
        skuSnapshot: { $first: "$items.sku" },
        revenue: { $sum: "$_analyticsLineRevenue" },
        quantity: { $sum: { $ifNull: ["$items.quantity", 0] } },
      },
    },
    {
      $group: {
        _id: "$_id.product",
        productId: { $first: "$_id.product" },
        productNames: { $addToSet: "$productNameSnapshot" },
        totalRevenue: { $sum: "$revenue" },
        totalQuantity: { $sum: "$quantity" },
        variants: {
          $push: {
            variantId: "$_id.variant",
            name: "$variantNameSnapshot",
            sku: "$skuSnapshot",
            revenue: "$revenue",
            quantity: "$quantity",
            averageSellingPrice: {
              $cond: [
                { $gt: ["$quantity", 0] },
                { $divide: ["$revenue", "$quantity"] },
                0,
              ],
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
      $addFields: {
        _snapshotProductNames: {
          $filter: {
            input: "$productNames",
            as: "productName",
            cond: {
              $and: [
                { $ne: ["$$productName", null] },
                { $ne: ["$$productName", ""] },
              ],
            },
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        productId: 1,
        productName: {
          $ifNull: [
            { $arrayElemAt: ["$_snapshotProductNames", 0] },
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
        totalQuantity: 1,
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
      },
    },
  ]);

  const normalizeProduct = (product) => ({
    ...product,
    variants: [...(product?.variants || [])].sort(
      (left, right) =>
        (right.revenue || 0) - (left.revenue || 0) ||
        (right.quantity || 0) - (left.quantity || 0),
    ),
  });

  const byRevenue = (result?.byRevenue || []).map(normalizeProduct);
  const byUnits = (result?.byUnits || []).map(normalizeProduct);

  return {
    success: true,
    data: {
      products: byRevenue,
      byRevenue,
      byUnits,
      metricBasis: {
        revenue:
          "Collected merchandise revenue after proportional order discounts; excludes delivery fees and item-unattributed refunds.",
        units:
          "Units on collected orders, including partially-paid orders.",
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

async function GetDashboard({
  range,
  from,
  to,
  interval,
  orderSource,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
} = {}) {
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
  const topProductsPromise = GetTopProducts({
    range,
    from,
    to,
    limit: 5,
    orderSource,
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
  });

  const [
    comparison,
    revenue,
    topProducts,
    salesBreakdown,
    recentOrders,
    stockSnapshot,
  ] = await Promise.all([
    comparisonPromise,
    revenuePromise,
    topProductsPromise,
    salesBreakdownPromise,
    recentOrdersPromise,
    stockSnapshotPromise,
  ]);

  const failed = [
    comparison,
    revenue,
    topProducts,
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
  GetSalesTrends,
  GetRevenueSeries,
  GetRevenueOverview,
  GetOrderStatusCounts,
  GetTopProducts,
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
