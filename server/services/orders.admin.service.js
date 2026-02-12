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

  /* ==============================
     BASIC FILTERS
  ============================== */

  if (filters.status) {
    // Accept single or array
    if (Array.isArray(filters.status)) {
      query.status = { $in: filters.status };
    } else {
      query.status = filters.status;
    }
  }

  if (filters.customer) {
    if (mongoose.Types.ObjectId.isValid(filters.customer)) {
      query.customer = filters.customer;
    }
  }

  if (filters.currency) {
    query.currency = filters.currency;
  }

  if (filters.orderId) {
    // Partial match (case insensitive)
    query.orderId = {
      $regex: filters.orderId,
      $options: "i",
    };
  }

  if (filters.stripeCheckoutSessionId) {
    query.stripeCheckoutSessionId = filters.stripeCheckoutSessionId;
  }

  if (filters.stripePaymentIntentId) {
    query.stripePaymentIntentId = filters.stripePaymentIntentId;
  }

  /* ==============================
     TOTAL RANGE
  ============================== */

  if (filters.minTotal || filters.maxTotal) {
    query.total = {};
    if (filters.minTotal) query.total.$gte = Number(filters.minTotal);
    if (filters.maxTotal) query.total.$lte = Number(filters.maxTotal);
  }

  /* ==============================
     CREATED DATE RANGE
  ============================== */

  if (filters.dateFrom || filters.dateTo) {
    query.createdAt = {};
    if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) query.createdAt.$lte = new Date(filters.dateTo);
  }

  /* ==============================
     PAID DATE RANGE
  ============================== */

  if (filters.paidFrom || filters.paidTo) {
    query.paidAt = {};
    if (filters.paidFrom) query.paidAt.$gte = new Date(filters.paidFrom);
    if (filters.paidTo) query.paidAt.$lte = new Date(filters.paidTo);
  }

  /* ==============================
     REFUND FILTERS
  ============================== */

  if (filters.refundedOnly) {
    query["refund.refundedAt"] = { $ne: null };
  }

  if (filters.restock !== undefined) {
    query["refund.restock"] = filters.restock === true;
  }

  /* ==============================
     EXPIRED ORDERS
  ============================== */

  if (filters.expiredOnly) {
    query.expiresAt = { $ne: null };
  }

  /* ==============================
     SORTING
  ============================== */

  const sort = {
    [sortBy]: sortOrder === "asc" ? 1 : -1,
  };

  /* ==============================
     EXECUTION
  ============================== */

  // If a free-text search is provided, use an aggregation pipeline so we can
  // search customer fields as well.
  if (search) {
    const sortStage = {
      [sortBy]: sortOrder === "asc" ? 1 : -1,
    };

    const or = [
      { orderId: { $regex: search, $options: "i" } },
      { stripePaymentIntentId: { $regex: search, $options: "i" } },
      { stripeCheckoutSessionId: { $regex: search, $options: "i" } },
      { status: search.toLowerCase() },
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

async function UpdateOrderStatus({ orderId, status }) {
  const order = await Order.findById(orderId);

  if (!order) {
    return { success: false, message: "Order not found" };
  }

  order.status = status;
  await order.save();

  return { success: true, data: order };
}

module.exports = {
  ListOrders,
  GetOrderById,
  UpdateOrderStatus,
};
