const Order = require("../models/order.model");
const mongoose = require("mongoose");

async function ListOrders({
  filters = {},
  page = 1,
  pageSize = 20,
  sortBy = "createdAt",
  sortOrder = "desc",
}) {
  const query = {};
  const search =
    typeof filters.search === "string" ? filters.search.trim() : "";

  // 🔒 Payment status is restricted (always)
  const ALLOWED_PAYMENT = new Set(["paid", "refunded", "refund_pending"]);
  const DEFAULT_PAYMENT = ["paid", "refunded", "refund_pending"];

  // ✅ Delivery status is filterable
  const ALLOWED_DELIVERY = new Set([
    "ordered",
    "dispatched",
    "in_transit",
    "delivered",
    "returned",
  ]);

  /* ==============================
     PAYMENT STATUS (LOCKED)
     Always constrain results to pending/paid/refunded/refund_pending
     Ignore whatever the client sends in filters.status
  ============================== */
  query.status = { $in: DEFAULT_PAYMENT };

  /* ==============================
     DELIVERY STATUS (FILTERABLE)
  ============================== */
  if (filters.deliveryStatus) {
    const incoming = Array.isArray(filters.deliveryStatus)
      ? filters.deliveryStatus
      : [filters.deliveryStatus];

    const cleaned = incoming
      .map((s) => String(s).trim().toLowerCase())
      .filter((s) => ALLOWED_DELIVERY.has(s));

    if (cleaned.length) {
      query.deliveryStatus = { $in: cleaned };
    }
    // If cleaned is empty, we simply do NOT apply a deliveryStatus filter.
  }

  /* ==============================
     OTHER FILTERS
  ============================== */

  if (filters.customer) {
    if (mongoose.Types.ObjectId.isValid(filters.customer)) {
      query.customer = filters.customer;
    }
  }

  if (filters.currency) {
    query.currency = filters.currency;
  }

  if (filters.orderId) {
    query.orderId = { $regex: filters.orderId, $options: "i" };
  }

  if (filters.stripeCheckoutSessionId) {
    query.stripeCheckoutSessionId = filters.stripeCheckoutSessionId;
  }

  if (filters.stripePaymentIntentId) {
    query.stripePaymentIntentId = filters.stripePaymentIntentId;
  }

  if (filters.minTotal || filters.maxTotal) {
    query.total = {};
    if (filters.minTotal) query.total.$gte = Number(filters.minTotal);
    if (filters.maxTotal) query.total.$lte = Number(filters.maxTotal);
  }

  if (filters.dateFrom || filters.dateTo) {
    query.createdAt = {};
    if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) query.createdAt.$lte = new Date(filters.dateTo);
  }

  if (filters.paidFrom || filters.paidTo) {
    query.paidAt = {};
    if (filters.paidFrom) query.paidAt.$gte = new Date(filters.paidFrom);
    if (filters.paidTo) query.paidAt.$lte = new Date(filters.paidTo);
  }

  if (filters.refundedOnly) {
    query["refund.refundedAt"] = { $ne: null };
    // Optional: enforce status = refunded when refundedOnly is true:
    // query.status = "refunded";
  }

  if (filters.restock !== undefined) {
    query["refund.restock"] = filters.restock === true;
  }

  if (filters.expiredOnly) {
    query.expiresAt = { $ne: null };
  }

  /* ==============================
     SORTING
  ============================== */
  const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

  /* ==============================
     EXECUTION
  ============================== */

  if (search) {
    const sortStage = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
    const lower = search.toLowerCase();

    // Only allow status-search matches for allowed payment statuses
    const paymentMatch = ALLOWED_PAYMENT.has(lower) ? [{ status: lower }] : [];

    // Allow delivery status matches too (if user types "delivered" etc.)
    const deliveryMatch = ALLOWED_DELIVERY.has(lower)
      ? [{ deliveryStatus: lower }]
      : [];

    const or = [
      { orderId: { $regex: search, $options: "i" } },
      { stripePaymentIntentId: { $regex: search, $options: "i" } },
      { stripeCheckoutSessionId: { $regex: search, $options: "i" } },

      ...paymentMatch,
      ...deliveryMatch,

      { "customer.firstName": { $regex: search, $options: "i" } },
      { "customer.lastName": { $regex: search, $options: "i" } },
      { "customer.email": { $regex: search, $options: "i" } },
      { "customer.phone": { $regex: search, $options: "i" } },
    ];

    if (mongoose.Types.ObjectId.isValid(search)) {
      const objId = new mongoose.Types.ObjectId(search);
      or.push({ _id: objId });
      or.push({ customerId: objId });
    }

    const pipeline = [
      { $match: query },
      { $addFields: { customerId: "$customer" } },
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
      { $match: { $or: or } },
      { $sort: sortStage },
      {
        $facet: {
          data: [
            { $skip: (Number(page) - 1) * Number(pageSize) },
            { $limit: Number(pageSize) },
          ],
          meta: [{ $count: "total" }],
        },
      },
    ];

    const result = await Order.aggregate(pipeline);
    const orders = result[0]?.data || [];
    const total = result[0]?.meta[0]?.total || 0;

    return {
      success: true,
      data: {
        orders,
        meta: {
          page: Number(page),
          pageSize: Number(pageSize),
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    };
  }

  const total = await Order.countDocuments(query);

  const orders = await Order.find(query)
    .populate({
      path: "customer",
      select: "firstName lastName email phone",
    })
    .sort(sort)
    .skip((page - 1) * pageSize)
    .limit(Number(pageSize));

  return {
    success: true,
    data: {
      orders,
      meta: {
        page: Number(page),
        pageSize: Number(pageSize),
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    },
  };
}

async function GetOrderById({ orderId }) {
  const order = await Order.findById(orderId).populate("customer");

  if (!order) {
    return { success: false, message: "Order not found" };
  }

  return { success: true, data: order };
}

async function UpdateOrderStatus({ orderId, deliveryStatus }) {
  const order = await Order.findById(orderId);

  if (!order) {
    return { success: false, message: "Order not found" };
  }

  order.deliveryStatus = deliveryStatus;
  await order.save();

  return { success: true, data: order };
}

async function BulkUpdateDeliveryStatus({ orderIds, deliveryStatus }) {
  const ids = orderIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (!ids.length) {
    return {
      success: false,
      statusCode: 400,
      message: "No valid orderIds provided",
    };
  }

  const result = await Order.updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        deliveryStatus,
        updatedAt: new Date(),
      },
    },
  );

  return {
    success: true,
    data: {
      matched: result.matchedCount ?? result.n ?? 0,
      modified: result.modifiedCount ?? result.nModified ?? 0,
    },
  };
}

async function bulkAssignDeliveryDate({ orderIds, deliveryDate }) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return { success: false, message: "orderIds required" };
  }

  if (!deliveryDate) {
    return { success: false, message: "deliveryDate required" };
  }

  const date = new Date(deliveryDate);

  if (Number.isNaN(date.getTime())) {
    return { success: false, message: "Invalid deliveryDate" };
  }

  // Normalize to midnight UTC
  date.setUTCHours(0, 0, 0, 0);

  const result = await Order.updateMany(
    {
      _id: { $in: orderIds },
      status: "paid",
    },
    {
      $set: { deliveryDate: date },
    },
  );

  return {
    success: true,
    data: {
      matched: result.matchedCount,
      modified: result.modifiedCount,
      deliveryDate: date,
    },
  };
}

module.exports = {
  ListOrders,
  GetOrderById,
  UpdateOrderStatus,
  BulkUpdateDeliveryStatus,
  bulkAssignDeliveryDate,
};
