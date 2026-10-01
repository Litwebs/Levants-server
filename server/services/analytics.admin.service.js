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
  EFFECTIVE_PAID_AT_EXPRESSION,
  COLLECTED_AMOUNT_EXPRESSION,
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

  return {
    totalOrders,
    grossRevenue,
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
        $group: {
          _id: salesStages.groupId,
          revenue: { $sum: COLLECTED_AMOUNT_EXPRESSION },
          orders: { $sum: 1 },
        },
      },
      { $sort: salesStages.sortStage },
      { $project: salesStages.projectStage },
    ]),

    Order.aggregate([
      {
        $match: {
          ...ACTIVE_ORDER_MATCH,
          ...sourceMatch,
          ...buildRefundLedgerPrefilter({ range, from, to, timeZone }),
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
          _id: refundStages.groupId,
          revenue: { $sum: REFUND_AMOUNT_EXPRESSION },
          orders: { $sum: 0 },
        },
      },
      { $sort: refundStages.sortStage },
      { $project: refundStages.projectStage },
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
        },
      },
      { $match: { _analyticsSucceededRefundCount: 0 } },
      {
        $group: {
          _id: legacyRefundStages.groupId,
          revenue: { $sum: COLLECTED_AMOUNT_EXPRESSION },
          orders: { $sum: 0 },
        },
      },
      { $sort: legacyRefundStages.sortStage },
      { $project: legacyRefundStages.projectStage },
    ]),
  ]);

  const byLabel = new Map();

  for (const row of salesRows || []) {
    byLabel.set(row.label, {
      label: row.label,
      grossRevenue: row.revenue || 0,
      refunds: 0,
      netRevenue: row.revenue || 0,
      revenue: row.revenue || 0,
      orders: row.orders || 0,
    });
  }

  for (const row of [...(refundRows || []), ...(legacyRefundRows || [])]) {
    const point = byLabel.get(row.label) || {
      label: row.label,
      grossRevenue: 0,
      refunds: 0,
      netRevenue: 0,
      revenue: 0,
      orders: 0,
    };
    point.refunds += row.revenue || 0;
    point.netRevenue = point.grossRevenue - point.refunds;
    point.revenue = point.netRevenue;
    byLabel.set(row.label, point);
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

  return {
    success: true,
    data: {
      interval: normalizedInterval,
      period:
        parsedPeriod.start && parsedPeriod.end
          ? {
              from: formatYmdInTimeZone(parsedPeriod.start, timeZone),
              to: formatYmdInTimeZone(parsedPeriod.end, timeZone),
              timeZone: parsedPeriod.timeZone,
            }
          : null,
      points,
      totals,
    },
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
} = {}) {
  const salesMatch = buildSalesOrderMatch({
    range,
    from,
    to,
    orderSource,
  });

  const lim = Math.max(1, Math.min(Number(limit) || 5, 25));

  const rows = await Order.aggregate([
    { $match: salesMatch },
    { $unwind: "$items" },
    {
      $group: {
        _id: { product: "$items.product", variant: "$items.variant" },
        revenue: { $sum: "$items.subtotal" },
        quantity: { $sum: "$items.quantity" },
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "_id.product",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    {
      $lookup: {
        from: "productvariants",
        localField: "_id.variant",
        foreignField: "_id",
        as: "variant",
      },
    },
    { $unwind: "$variant" },
    {
      $group: {
        _id: "$_id.product",
        productId: { $first: "$_id.product" },
        productName: { $first: "$product.name" },
        totalRevenue: { $sum: "$revenue" },
        totalQuantity: { $sum: "$quantity" },
        variants: {
          $push: {
            variantId: "$_id.variant",
            name: "$variant.name",
            sku: "$variant.sku",
            revenue: "$revenue",
            quantity: "$quantity",
          },
        },
      },
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: lim },
  ]);

  // Sort variants inside each product (desc revenue)
  const products = (rows || []).map((p) => ({
    productId: p.productId,
    productName: p.productName,
    totalRevenue: p.totalRevenue,
    totalQuantity: p.totalQuantity,
    variants: (p.variants || []).sort(
      (a, b) => (b.revenue || 0) - (a.revenue || 0),
    ),
  }));

  return {
    success: true,
    data: {
      products,
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

  const summaryPromise = GetSummary({
    range,
    from,
    to,
    orderSource,
    timeZone,
    stockCountsPromise,
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

  const [comparison, revenue, topProducts, recentOrders, stockSnapshot] =
    await Promise.all([
      comparisonPromise,
      revenuePromise,
      topProductsPromise,
      recentOrdersPromise,
      stockSnapshotPromise,
    ]);

  const failed = [
    comparison,
    revenue,
    topProducts,
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
      topProducts: topProducts.data,
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
