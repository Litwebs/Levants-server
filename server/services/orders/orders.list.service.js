"use strict";

const mongoose = require("mongoose");
const Order = require("../../models/order.model");
const {
  ACTIVE_ORDER_FILTER,
  buildPaymentVisibilityQuery,
} = require("../../utils/ordersAdmin.util");

const ALLOWED_PAYMENT = new Set([
  "pending",
  "unpaid",
  "paid",
  "refund_pending",
  "partially_refunded",
  "refunded",
]);
const DEFAULT_PAYMENT = [
  "pending",
  "unpaid",
  "paid",
  "refund_pending",
  "partially_refunded",
  "refunded",
];
const ALLOWED_DELIVERY = new Set([
  "ordered",
  "dispatched",
  "in_transit",
  "delivered",
  "returned",
]);

async function ListOrders({
  filters = {},
  page = 1,
  pageSize = 20,
  sortBy = "createdAt",
  sortOrder = "desc",
}) {
  const query = { ...ACTIVE_ORDER_FILTER };
  const search =
    typeof filters.search === "string" ? filters.search.trim() : "";

  const normalizedOrderSource =
    typeof filters.orderSource === "string"
      ? filters.orderSource.trim().toLowerCase()
      : "";
  const incomingPaymentStatuses = Array.isArray(filters.paymentStatus)
    ? filters.paymentStatus
    : filters.paymentStatus
      ? [filters.paymentStatus]
      : [];

  const cleanedPaymentStatuses = incomingPaymentStatuses
    .map((status) => String(status).trim().toLowerCase())
    .filter((status) => ALLOWED_PAYMENT.has(status));

  const effectivePaymentStatuses = cleanedPaymentStatuses.length
    ? cleanedPaymentStatuses
    : DEFAULT_PAYMENT;

  Object.assign(
    query,
    buildPaymentVisibilityQuery({
      requestedStatuses: effectivePaymentStatuses,
      normalizedOrderSource,
    }),
  );

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
    query.$and = Array.isArray(query.$and) ? query.$and : [];
    query.$and.push({
      $or: [
        { "refund.refundedAt": { $ne: null } },
        { "refunds.status": "succeeded" },
        { status: "partially_refunded" },
        { status: "refunded" },
      ],
    });
  }

  if (filters.restock !== undefined) {
    const want = filters.restock === true;
    query.$and = Array.isArray(query.$and) ? query.$and : [];
    query.$and.push({
      $or: [{ "refund.restock": want }, { "refunds.restock": want }],
    });
  }

  if (filters.expiredOnly) {
    query.expiresAt = { $ne: null };
  }

  const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

  if (search) {
    const sortStage = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
    const lower = search.toLowerCase();

    const paymentMatch = ALLOWED_PAYMENT.has(lower) ? [{ status: lower }] : [];
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

module.exports = { ListOrders };
