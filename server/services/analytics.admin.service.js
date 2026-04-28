const mongoose = require("mongoose");

const Order = require("../models/order.model");
const Product = require("../models/product.model");
const ProductVariant = require("../models/variant.model");

const {
  parseDateRange,
  clampToStartOfDay,
  clampToEndOfDay,
  formatYmdInTimeZone,
} = require("../utils/analyticsDate.util");

const {
  ACTIVE_ORDER_MATCH,
  ANALYTICS_ORDER_STATUSES,
  PAID_ORDER_MATCH,
  buildOrderSourceMatch,
  buildOrderMatch,
} = require("../utils/analyticsFilter.util");

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
  buildRevenueSeriesStages,
} = require("../utils/analyticsRevenueSeries.util");

async function GetSummary({ range, from, to, orderSource } = {}) {
  const orderMatch = buildOrderMatch({ range, from, to, orderSource });
  const { start } = parseDateRange({ range, from, to });

  const paidCreatedAtMatch = {
    ...orderMatch,
    status: "paid",
    customer: { $ne: null },
  };

  const customerAggPipeline = start
    ? [
        { $match: paidCreatedAtMatch },
        { $group: { _id: "$customer" } },
        {
          $lookup: {
            from: "orders",
            let: { customerId: "$_id" },
            pipeline: [
              {
                $match: {
                  ...ACTIVE_ORDER_MATCH,
                  ...buildOrderSourceMatch(orderSource),
                  $expr: {
                    $and: [
                      { $eq: ["$customer", "$$customerId"] },
                      { $eq: ["$status", "paid"] },
                      { $lt: ["$createdAt", start] },
                    ],
                  },
                },
              },
              { $limit: 1 },
              { $project: { _id: 1 } },
            ],
            as: "previousPaid",
          },
        },
        {
          $project: {
            isNew: { $eq: [{ $size: "$previousPaid" }, 0] },
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
        { $match: paidCreatedAtMatch },
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

  const [
    totalOrders,
    revenueAgg,
    statusCounts,
    lowStockCountAgg,
    outOfStockCountAgg,
    unitsSoldAgg,
    customersAgg,
  ] = await Promise.all([
    Order.countDocuments({
      ...orderMatch,
      ...PAID_ORDER_MATCH,
    }),

    Order.aggregate([
      { $match: { ...orderMatch, ...PAID_ORDER_MATCH } },
      { $group: { _id: null, revenue: { $sum: "$total" } } },
    ]),

    Order.aggregate([
      {
        $match: {
          ...orderMatch,
          ...PAID_ORDER_MATCH,
        },
      },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),

    ProductVariant.aggregate([
      { $match: { status: "active" } },
      STOCK_AVAILABLE_ADD_FIELDS,
      LOW_STOCK_MATCH,
      { $count: "count" },
    ]),

    ProductVariant.aggregate([
      { $match: { status: "active" } },
      STOCK_AVAILABLE_ADD_FIELDS,
      OUT_OF_STOCK_MATCH,
      { $count: "count" },
    ]),

    // Total units sold (paid orders only)
    Order.aggregate([
      { $match: { ...orderMatch, ...PAID_ORDER_MATCH } },
      { $unwind: "$items" },
      { $group: { _id: null, unitsSold: { $sum: "$items.quantity" } } },
    ]),

    // New vs repeat customers (paid orders only)
    Order.aggregate(customerAggPipeline),
  ]);

  const revenue = revenueAgg?.[0]?.revenue ?? 0;
  const unitsSold = unitsSoldAgg?.[0]?.unitsSold ?? 0;

  const customerStats = customersAgg?.[0] || {};
  const newCustomers = customerStats.newCustomers ?? 0;
  const repeatCustomers = customerStats.repeatCustomers ?? 0;

  const counts = buildAnalyticsCounts(statusCounts);
  const summaryCounts = summarizeAnalyticsCounts(counts);

  const lowStockItemsCount = lowStockCountAgg?.[0]?.count ?? 0;
  const outOfStockItemsCount = outOfStockCountAgg?.[0]?.count ?? 0;

  return {
    success: true,
    data: {
      totalOrders,
      revenue,
      unitsSold,
      totalRefunds: summaryCounts.totalRefunds,
      newCustomers,
      repeatCustomers,
      pendingOrders: summaryCounts.pending,
      paidOrders: counts.paid,
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
        Failed: counts.failed,
        Cancelled: counts.cancelled,
        "Refund Pending": counts.refund_pending,
        Refunded: summaryCounts.refunded,
        "Refund Failed": counts.refund_failed,
      },
    },
  };
}

async function GetRevenueSeries({
  range,
  from,
  to,
  interval = "week",
  orderSource,
} = {}) {
  const orderMatch = buildOrderMatch({ range, from, to, orderSource });
  const i = typeof interval === "string" ? interval : "week";
  const { groupId, sortStage, projectStage } = buildRevenueSeriesStages(
    interval,
    range,
  );

  const series = await Order.aggregate([
    { $match: { ...orderMatch, status: "paid" } },
    {
      $group: {
        _id: groupId,
        revenue: { $sum: "$total" },
        orders: { $sum: 1 },
      },
    },
    { $sort: sortStage },
    { $project: projectStage },
  ]);

  return {
    success: true,
    data: {
      interval: i,
      points: series,
    },
  };
}

async function GetRevenueOverview({
  days = 7,
  timeZone = "Europe/London",
  orderSource,
} = {}) {
  const d = Math.max(7, Math.min(Number(days) || 7, 90));

  const now = new Date();
  const end = clampToEndOfDay(now);
  const start = new Date(end);
  start.setDate(start.getDate() - (d - 1));
  const startDay = clampToStartOfDay(start);

  const rows = await Order.aggregate([
    {
      $match: {
        ...ACTIVE_ORDER_MATCH,
        ...buildOrderSourceMatch(orderSource),
        status: "paid",
        createdAt: { $gte: startDay, $lte: end },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$createdAt",
            timezone: timeZone,
          },
        },
        revenue: { $sum: "$total" },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byDay = new Map();
  for (const r of rows || []) {
    byDay.set(r._id, { revenue: r.revenue || 0, orders: r.orders || 0 });
  }

  const points = [];
  for (let i = 0; i < d; i++) {
    const day = new Date(startDay);
    day.setDate(day.getDate() + i);
    const key = formatYmdInTimeZone(day, timeZone);
    const v = byDay.get(key) || { revenue: 0, orders: 0 };

    const isToday = key === formatYmdInTimeZone(now, timeZone);

    points.push({
      date: key,
      label: key,
      revenue: v.revenue,
      orders: v.orders,
      isToday,
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
  const orderMatch = buildOrderMatch({ range, from, to, orderSource });

  const lim = Math.max(1, Math.min(Number(limit) || 5, 25));

  const rows = await Order.aggregate([
    { $match: { ...orderMatch, status: "paid" } },
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
  interval = "week",
  orderSource,
} = {}) {
  const [summary, revenue, topProducts, recentOrders, lowStock, outOfStock] =
    await Promise.all([
      GetSummary({ range, from, to, orderSource }),
      GetRevenueSeries({ range, from, to, interval, orderSource }),
      GetTopProducts({ range, from, to, limit: 5, orderSource }),
      GetRecentOrders({ range, from, to, limit: 5, orderSource }),
      GetLowStock({ limit: 50 }),
      GetOutOfStock({ limit: 50 }),
    ]);

  return {
    success: true,
    data: {
      summary: summary.data,
      revenue: revenue.data,
      topProducts: topProducts.data,
      recentOrders: recentOrders.data,
      lowStock: lowStock.data,
      outOfStock: outOfStock.data,
    },
  };
}

module.exports = {
  parseDateRange,
  GetSummary,
  GetRevenueSeries,
  GetRevenueOverview,
  GetOrderStatusCounts,
  GetTopProducts,
  GetRecentOrders,
  GetLowStock,
  GetOutOfStock,
  GetDashboard,
};
