"use strict";

const Order = require("../../models/order.model");
const Customer = require("../../models/customer.model");
const CustomerNotification = require("../../models/customerNotification.model");
const subscriptionSettingsService = require("../subscriptionSettings.service");
const { geocodeAddress } = require("../../Integration/google.geocode");
const logger = require("../../utils/logger.util");
const { Response } = require("../../utils/response.util");
const {
  computeSubscriptionCutoffDate,
} = require("../../utils/subscriptionCutoff.util");

const ALLOWED_CANCEL_STATUSES = ["pending", "unpaid"];
const DELIVERY_STATUS_FILTERS = new Set([
  "ordered",
  "dispatched",
  "in_transit",
  "delivered",
  "returned",
]);
const RECEIPT_ELIGIBLE_STATUSES = new Set([
  "paid",
  "partially_paid",
  "partially_refunded",
  "refunded",
]);
const DELIVERY_CHANGE_ELIGIBLE_STATUSES = new Set(["paid", "partially_paid"]);

/**
 * List orders for a customer.
 */
async function ListOrders({
  customerId,
  page = 1,
  pageSize = 20,
  status,
  search,
} = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));

  const filter = { customer: customerId, status: { $ne: "pending" } };
  if (status) {
    if (status === "pending") {
      return Response(true, null, {
        orders: [],
        meta: { page: safePage, pageSize: safePageSize, total: 0 },
      });
    }
    if (DELIVERY_STATUS_FILTERS.has(status)) {
      filter.deliveryStatus = status;
    } else {
      filter.status = status;
    }
  }

  const trimmedSearch = String(search || "").trim();
  if (trimmedSearch) {
    const escaped = trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    filter.$or = [{ orderId: regex }, { "items.name": regex }];
  }

  const total = await Order.countDocuments(filter);
  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .skip((safePage - 1) * safePageSize)
    .limit(safePageSize)
    .lean();

  return Response(true, null, {
    orders,
    meta: { page: safePage, pageSize: safePageSize, total },
  });
}

/**
 * Get a single order for a customer.
 */
async function GetOrder({ customerId, orderId } = {}) {
  const order = await Order.findOne({
    _id: orderId,
    customer: customerId,
    status: { $ne: "pending" },
  })
    .populate("subscription", "subscriptionNumber")
    .populate("customer", "firstName lastName email phone")
    .lean();

  if (!order) return Response(false, "Order not found", null);

  const settings = await subscriptionSettingsService.getOrCreateSettings();
  const cutoffAt = order.deliveryDate
    ? computeSubscriptionCutoffDate(order.deliveryDate, settings)
    : null;
  const deliveryChangeAllowed =
    DELIVERY_CHANGE_ELIGIBLE_STATUSES.has(order.status) &&
    order.deliveryStatus === "ordered" &&
    Boolean(order.deliveryDate) &&
    Boolean(cutoffAt && Date.now() < cutoffAt.getTime());

  const customerDoc =
    order.customer && typeof order.customer === "object"
      ? order.customer
      : null;

  const normalizedOrder = {
    ...order,
    customer: customerDoc?._id || order.customer,
    customerDetails: customerDoc
      ? {
          firstName: customerDoc.firstName || null,
          lastName: customerDoc.lastName || null,
          email: customerDoc.email || null,
          phone: customerDoc.phone || null,
        }
      : null,
    deliveryChangeAllowed,
    deliveryChangeCutoffAt: cutoffAt,
  };

  return Response(true, null, { order: normalizedOrder });
}

async function UpdateOrderDelivery({
  customerId,
  orderId,
  deliveryAddressId,
} = {}) {
  const order = await Order.findOne({ _id: orderId, customer: customerId });
  if (!order) return Response(false, "Order not found", null);
  if (
    !DELIVERY_CHANGE_ELIGIBLE_STATUSES.has(order.status) ||
    order.deliveryStatus !== "ordered" ||
    !order.deliveryDate
  ) {
    return Response(
      false,
      "This order's delivery can no longer be changed",
      null,
    );
  }

  const settings = await subscriptionSettingsService.getOrCreateSettings();
  const currentCutoffAt = computeSubscriptionCutoffDate(order.deliveryDate, settings);
  if (Date.now() >= currentCutoffAt.getTime()) {
    return Response(false, "The cut-off for this order has passed", null);
  }

  const customer = await Customer.findById(customerId);
  const address = customer?.addresses.id(deliveryAddressId);
  if (!address) return Response(false, "Delivery address not found", null);

  try {
    const geo = await geocodeAddress({
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      postcode: address.postcode,
      country: address.country,
    });
    // Only update if geocoding returned valid coordinates; keep existing otherwise
    if (geo && typeof geo.lat === "number" && typeof geo.lng === "number") {
      order.location = geo;
    }
  } catch (error) {
    // Geocoding must not block a valid address change, but it must be visible
    // operationally so stale coordinates can be investigated/reconciled.
    logger.warn(
      `[PortalOrders] Geocoding failed while updating delivery for order ${order.orderId}; preserving existing coordinates`,
      {
        orderId: String(order._id),
        error: error?.message || String(error),
      },
    );
  }

  order.deliveryAddress = {
    line1: address.line1,
    line2: address.line2 || null,
    city: address.city,
    postcode: address.postcode,
    country: address.country,
  };

  await order.save();

  await CustomerNotification.create({
    customer: customerId,
    type: "order_delivery_updated",
    title: "Delivery updated",
    message: `Delivery details for order ${order.orderId} have been updated.`,
    relatedOrder: order._id,
  });

  const updatedOrder = await GetOrder({ customerId, orderId });
  return Response(true, "Delivery details updated", updatedOrder.data);
}

/**
 * Get order data required to render a custom receipt template.
 */
async function GetOrderReceiptData({ customerId, orderId } = {}) {
  const order = await Order.findOne({
    _id: orderId,
    customer: customerId,
    status: { $ne: "pending" },
  })
    .populate("customer", "firstName lastName email phone")
    .lean();

  if (!order) return Response(false, "Order not found", null);

  const hasPaymentEvidence =
    Boolean(order.paidAt) || RECEIPT_ELIGIBLE_STATUSES.has(order.status);

  if (!hasPaymentEvidence) {
    return Response(false, "Receipt is not available for this order yet", null);
  }

  const customerDoc =
    order.customer && typeof order.customer === "object"
      ? order.customer
      : null;

  const receiptOrder = {
    ...order,
    customer: customerDoc?._id || order.customer,
    customerDetails: customerDoc
      ? {
          firstName: customerDoc.firstName || null,
          lastName: customerDoc.lastName || null,
          email: customerDoc.email || null,
          phone: customerDoc.phone || null,
        }
      : null,
  };

  return Response(true, null, { order: receiptOrder });
}

/**
 * Get Stripe receipt URL for a customer order.
 */
async function GetOrderReceiptUrl({ customerId, orderId } = {}) {
  const receiptDataResult = await GetOrderReceiptData({ customerId, orderId });
  if (!receiptDataResult.success) {
    return receiptDataResult;
  }

  return Response(true, null, {
    receiptUrl: `/api/portal/orders/${orderId}/receipt/custom`,
  });
}

/**
 * Cancel an order (customer-initiated, limited statuses).
 */
async function CancelOrder({ customerId, orderId, reason } = {}) {
  const order = await Order.findOne({ _id: orderId, customer: customerId });
  if (!order) return Response(false, "Order not found", null);

  if (!ALLOWED_CANCEL_STATUSES.includes(order.status)) {
    return Response(
      false,
      "This order cannot be cancelled at this stage",
      null,
    );
  }

  order.status = "cancelled";
  if (reason)
    order.metadata = { ...(order.metadata || {}), cancelReason: reason };
  await order.save();

  await CustomerNotification.create({
    customer: customerId,
    type: "order_cancelled",
    title: "Order cancelled",
    message: `Your order #${order.orderId} has been cancelled.`,
    relatedOrder: order._id,
  });

  return Response(true, "Order cancelled", { order });
}

module.exports = {
  ListOrders,
  GetOrder,
  UpdateOrderDelivery,
  GetOrderReceiptData,
  GetOrderReceiptUrl,
  CancelOrder,
};
