const mongoose = require("mongoose");

const Order = require("../models/order.model");
const Product = require("../models/product.model");
const ProductVariant = require("../models/variant.model");

const COUNTABLE_ORDER_STATUSES = ["paid", "refund_pending", "refunded"];

const clampToStartOfDay = (d) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

const clampToEndOfDay = (d) => {
  const date = new Date(d);
  date.setHours(23, 59, 59, 999);
  return date;
};

const parseDateRange = ({ range, from, to } = {}) => {
  const now = new Date();

  const hasCustom = Boolean(from || to);
  if (hasCustom) {
    const start = from ? clampToStartOfDay(new Date(from)) : null;
    const end = to ? clampToEndOfDay(new Date(to)) : null;

    if (
      (start && Number.isNaN(start.getTime())) ||
      (end && Number.isNaN(end.getTime()))
    ) {
      return { start: null, end: null };
    }

    return { start, end };
  }

  const r = typeof range === "string" ? range : "all";

  if (r === "all") return { start: null, end: null };

  if (r === "today") {
    return { start: clampToStartOfDay(now), end: clampToEndOfDay(now) };
  }

  if (r === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { start: clampToStartOfDay(y), end: clampToEndOfDay(y) };
  }

  if (r === "last7") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { start: clampToStartOfDay(start), end: clampToEndOfDay(now) };
  }

  if (r === "last30") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { start: clampToStartOfDay(start), end: clampToEndOfDay(now) };
  }

  if (r === "thisMonth") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: clampToStartOfDay(start), end: clampToEndOfDay(now) };
  }

  if (r === "lastMonth") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: clampToStartOfDay(start), end: clampToEndOfDay(end) };
  }

  if (r === "thisYear") {
    const start = new Date(now.getFullYear(), 0, 1);
    return { start: clampToStartOfDay(start), end: clampToEndOfDay(now) };
  }

  if (r === "lastYear") {
    const start = new Date(now.getFullYear() - 1, 0, 1);
    const end = new Date(now.getFullYear() - 1, 11, 31);
    return { start: clampToStartOfDay(start), end: clampToEndOfDay(end) };
  }

  return { start: null, end: null };
};

const buildCreatedAtMatch = ({ range, from, to } = {}) => {
  const { start, end } = parseDateRange({ range, from, to });

  if (!start && !end) return {};

  const createdAt = {};
  if (start) createdAt.$gte = start;
  if (end) createdAt.$lte = end;

  return { createdAt };
};

const normalizeDeliveryStatus = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
};

async function GetSummary({ range, from, to } = {}) {
  const createdAtMatch = buildCreatedAtMatch({ range, from, to });

  const [
    totalOrders,
    revenueAgg,
    statusCounts,
    lowStockCountAgg,
    outOfStockCountAgg,
  ] = await Promise.all([
    Order.countDocuments({
      ...createdAtMatch,
      status: { $in: COUNTABLE_ORDER_STATUSES },
    }),

    Order.aggregate([
      { $match: { ...createdAtMatch, status: "paid" } },
      { $group: { _id: null, revenue: { $sum: "$total" } } },
    ]),

    // Real order status distribution (restricted to countable statuses)
    Order.aggregate([
      {
        $match: {
          ...createdAtMatch,
          status: { $in: COUNTABLE_ORDER_STATUSES },
        },
      },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),

    ProductVariant.aggregate([
      { $match: { status: "active" } },
      {
        $addFields: {
          available: {
            $subtract: [
              {
                $convert: {
                  input: "$stockQuantity",
                  to: "double",
                  onError: 0,
                  onNull: 0,
                },
              },
              {
                $convert: {
                  input: "$reservedQuantity",
                  to: "double",
                  onError: 0,
                  onNull: 0,
                },
              },
            ],
          },
        },
      },
      {
        $match: {
          // Low stock (available > 0 and available <= lowStockAlert)
          $expr: {
            $and: [
              { $gt: ["$available", 0] },
              {
                $lte: [
                  "$available",
                  {
                    $convert: {
                      input: "$lowStockAlert",
                      to: "double",
                      onError: 0,
                      onNull: 0,
                    },
                  },
                ],
              },
            ],
          },
        },
      },
      { $count: "count" },
    ]),

    ProductVariant.aggregate([
      { $match: { status: "active" } },
      {
        $addFields: {
          available: {
            $subtract: [
              {
                $convert: {
                  input: "$stockQuantity",
                  to: "double",
                  onError: 0,
                  onNull: 0,
                },
              },
              {
                $convert: {
                  input: "$reservedQuantity",
                  to: "double",
                  onError: 0,
                  onNull: 0,
                },
              },
            ],
          },
        },
      },
      {
        $match: {
          // Out of stock (available <= 0)
          $expr: { $lte: ["$available", 0] },
        },
      },
      { $count: "count" },
    ]),
  ]);

  const revenue = revenueAgg?.[0]?.revenue ?? 0;

  const counts = {
    pending: 0,
    paid: 0,
    failed: 0,
    cancelled: 0,
    refund_pending: 0,
    refunded: 0,
    refund_failed: 0,
  };

  for (const row of statusCounts || []) {
    if (row._id === "pending") counts.pending = row.count;
    else if (row._id === "paid") counts.paid = row.count;
    else if (row._id === "failed") counts.failed = row.count;
    else if (row._id === "cancelled") counts.cancelled = row.count;
    else if (row._id === "refund_pending") counts.refund_pending = row.count;
    else if (row._id === "refunded") counts.refunded = row.count;
    else if (row._id === "refund_failed") counts.refund_failed = row.count;
  }

  const lowStockItemsCount = lowStockCountAgg?.[0]?.count ?? 0;
  const outOfStockItemsCount = outOfStockCountAgg?.[0]?.count ?? 0;

  return {
    success: true,
    data: {
      totalOrders,
      revenue,
      pendingOrders: counts.pending,
      paidOrders: counts.paid,
      failedOrders: counts.failed,
      cancelledOrders: counts.cancelled,
      refundPendingOrders: counts.refund_pending,
      refundedOrders: counts.refunded,
      refundFailedOrders: counts.refund_failed,
      lowStockItems: lowStockItemsCount,
      outOfStockItems: outOfStockItemsCount,
      orderStatus: {
        Pending: counts.pending,
        Paid: counts.paid,
        Failed: counts.failed,
        Cancelled: counts.cancelled,
        "Refund Pending": counts.refund_pending,
        Refunded: counts.refunded,
        "Refund Failed": counts.refund_failed,
      },
    },
  };
}

async function GetRevenueSeries({ range, from, to, interval = "week" } = {}) {
  const createdAtMatch = buildCreatedAtMatch({ range, from, to });

  const i = typeof interval === "string" ? interval : "week";

  let groupId;
  let sortStage;
  let projectStage;

  if (i === "year") {
    groupId = { year: { $year: "$createdAt" } };
    sortStage = { "_id.year": 1 };
    projectStage = {
      _id: 0,
      label: { $toString: "$_id.year" },
      revenue: 1,
      orders: 1,
    };
  } else if (i === "month") {
    groupId = {
      year: { $year: "$createdAt" },
      month: { $month: "$createdAt" },
    };
    sortStage = { "_id.year": 1, "_id.month": 1 };
    projectStage = {
      _id: 0,
      label: {
        $concat: [
          { $toString: "$_id.year" },
          "-",
          {
            $cond: [
              { $lt: ["$_id.month", 10] },
              { $concat: ["0", { $toString: "$_id.month" }] },
              { $toString: "$_id.month" },
            ],
          },
        ],
      },
      revenue: 1,
      orders: 1,
    };
  } else {
    // "week" interval on short ranges should still show multiple points.
    // For today/yesterday/last7 we group by day.
    const r = typeof range === "string" ? range : "all";
    const useDaily = r === "today" || r === "yesterday" || r === "last7";

    if (useDaily) {
      groupId = {
        day: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
        },
      };
      sortStage = { "_id.day": 1 };
      projectStage = {
        _id: 0,
        label: "$_id.day",
        revenue: 1,
        orders: 1,
      };
    } else {
      // week (ISO)
      groupId = {
        year: { $isoWeekYear: "$createdAt" },
        week: { $isoWeek: "$createdAt" },
      };
      sortStage = { "_id.year": 1, "_id.week": 1 };
      projectStage = {
        _id: 0,
        label: {
          $concat: [
            "Wk-",
            {
              $cond: [
                { $lt: ["$_id.week", 10] },
                { $concat: ["0", { $toString: "$_id.week" }] },
                { $toString: "$_id.week" },
              ],
            },
          ],
        },
        revenue: 1,
        orders: 1,
      };
    }
  }

  const series = await Order.aggregate([
    { $match: { ...createdAtMatch, status: "paid" } },
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

const formatYmdInTimeZone = (date, timeZone) => {
  // en-CA yields YYYY-MM-DD in most JS engines.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

async function GetRevenueOverview({
  days = 7,
  timeZone = "Europe/London",
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

async function GetOrderStatusCounts({ range, from, to } = {}) {
  const createdAtMatch = buildCreatedAtMatch({ range, from, to });

  const statusCounts = await Order.aggregate([
    {
      $match: {
        ...createdAtMatch,
        status: { $in: COUNTABLE_ORDER_STATUSES },
      },
    },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const counts = {
    Pending: 0,
    Paid: 0,
    Failed: 0,
    Cancelled: 0,
    "Refund Pending": 0,
    Refunded: 0,
    "Refund Failed": 0,
  };

  for (const row of statusCounts || []) {
    if (row._id === "pending") counts.Pending = row.count;
    else if (row._id === "paid") counts.Paid = row.count;
    else if (row._id === "failed") counts.Failed = row.count;
    else if (row._id === "cancelled") counts.Cancelled = row.count;
    else if (row._id === "refund_pending") counts["Refund Pending"] = row.count;
    else if (row._id === "refunded") counts.Refunded = row.count;
    else if (row._id === "refund_failed") counts["Refund Failed"] = row.count;
  }

  return { success: true, data: { counts } };
}

async function GetTopProducts({ range, from, to, limit = 5 } = {}) {
  const createdAtMatch = buildCreatedAtMatch({ range, from, to });

  const lim = Math.max(1, Math.min(Number(limit) || 5, 25));

  const rows = await Order.aggregate([
    { $match: { ...createdAtMatch, status: "paid" } },
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

async function GetRecentOrders({ range, from, to, limit = 5 } = {}) {
  const createdAtMatch = buildCreatedAtMatch({ range, from, to });
  const lim = Math.max(1, Math.min(Number(limit) || 5, 25));

  const orders = await Order.find({ ...createdAtMatch })
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
    {
      $addFields: {
        available: {
          $subtract: [
            {
              $convert: {
                input: "$stockQuantity",
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
            {
              $convert: {
                input: "$reservedQuantity",
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          ],
        },
      },
    },
    {
      $match: {
        // Low stock (available > 0 and available <= lowStockAlert)
        $expr: {
          $and: [
            { $gt: ["$available", 0] },
            {
              $lte: [
                "$available",
                {
                  $convert: {
                    input: "$lowStockAlert",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              ],
            },
          ],
        },
      },
    },
    { $sort: { available: 1 } },
    { $limit: lim },
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "product",
      },
    },
    {
      $unwind: {
        path: "$product",
        preserveNullAndEmptyArrays: true,
      },
    },
    // Safety: prevent duplicates if joins ever multiply documents
    { $group: { _id: "$_id", doc: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$doc" } },
    {
      $project: {
        _id: 1,
        sku: 1,
        name: 1,
        stockQuantity: 1,
        reservedQuantity: 1,
        lowStockAlert: 1,
        available: 1,
        product: {
          _id: "$product._id",
          name: "$product.name",
          status: "$product.status",
        },
      },
    },
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
    {
      $addFields: {
        available: {
          $subtract: [
            {
              $convert: {
                input: "$stockQuantity",
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
            {
              $convert: {
                input: "$reservedQuantity",
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          ],
        },
      },
    },
    {
      $match: {
        // Out of stock (available <= 0)
        $expr: { $lte: ["$available", 0] },
      },
    },
    { $sort: { available: 1 } },
    { $limit: lim },
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "product",
      },
    },
    {
      $unwind: {
        path: "$product",
        preserveNullAndEmptyArrays: true,
      },
    },
    // Safety: prevent duplicates if joins ever multiply documents
    { $group: { _id: "$_id", doc: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$doc" } },
    {
      $project: {
        _id: 1,
        sku: 1,
        name: 1,
        stockQuantity: 1,
        reservedQuantity: 1,
        lowStockAlert: 1,
        available: 1,
        product: {
          _id: "$product._id",
          name: "$product.name",
          status: "$product.status",
        },
      },
    },
  ]);

  return {
    success: true,
    data: {
      items,
    },
  };
}

async function GetDashboard({ range, from, to, interval = "week" } = {}) {
  const [summary, revenue, topProducts, recentOrders, lowStock, outOfStock] =
    await Promise.all([
      GetSummary({ range, from, to }),
      GetRevenueSeries({ range, from, to, interval }),
      GetTopProducts({ range, from, to, limit: 5 }),
      GetRecentOrders({ range, from, to, limit: 5 }),
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
