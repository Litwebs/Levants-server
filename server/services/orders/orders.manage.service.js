"use strict";

const mongoose = require("mongoose");

const Order = require("../../models/order.model");
const ProductVariant = require("../../models/variant.model");

const { buildActiveOrderIdQuery } = require("../../utils/ordersAdmin.util");

async function GetOrderById({ orderId }) {
  const order = await Order.findOne(buildActiveOrderIdQuery(orderId)).populate(
    "customer",
  );

  if (!order) {
    return { success: false, message: "Order not found" };
  }

  return { success: true, data: order };
}

async function UpdateOrderPaymentStatus({ orderId, paid, actorUserId } = {}) {
  if (!orderId) {
    return { success: false, statusCode: 400, message: "orderId is required" };
  }

  const order = await Order.findOne(buildActiveOrderIdQuery(orderId));
  if (!order) {
    return { success: false, statusCode: 404, message: "Order not found" };
  }

  const isStripeBacked = Boolean(
    String(order.stripeCheckoutSessionId || "").trim() ||
    String(order.stripePaymentIntentId || "").trim(),
  );

  const isManualImport = Boolean(order?.metadata?.manualImport);
  if (isStripeBacked || !isManualImport) {
    return {
      success: false,
      statusCode: 400,
      message: "Payment status can only be edited for file-imported orders",
    };
  }

  const normalizedPaid = Boolean(paid);

  const lockedStatuses = new Set([
    "refund_pending",
    "partially_refunded",
    "refunded",
  ]);
  if (lockedStatuses.has(String(order.status))) {
    return {
      success: false,
      statusCode: 400,
      message: "Payment status cannot be changed for refunded orders",
    };
  }

  const now = new Date();

  if (normalizedPaid) {
    order.status = "paid";
    order.paidAt = order.paidAt || now;
  } else {
    order.status = "unpaid";
    order.paidAt = undefined;
  }

  if (!order.metadata || typeof order.metadata !== "object")
    order.metadata = {};
  order.metadata.paymentStatusUpdatedAt = now;
  if (actorUserId) order.metadata.paymentStatusUpdatedBy = String(actorUserId);
  order.markModified("metadata");

  await order.save();

  return { success: true, data: order };
}

async function UpdateOrderItems({ orderId, items, actorUserId } = {}) {
  if (!orderId) {
    return { success: false, statusCode: 400, message: "orderId is required" };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, statusCode: 400, message: "items is required" };
  }

  const order = await Order.findOne(buildActiveOrderIdQuery(orderId));
  if (!order) {
    return { success: false, statusCode: 404, message: "Order not found" };
  }

  const resolvedItems = [];
  let subtotal = 0;

  for (const item of items) {
    const quantity = Number(item?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { success: false, statusCode: 400, message: "Invalid quantity" };
    }

    const variantId = String(item?.variantId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(variantId)) {
      return {
        success: false,
        statusCode: 400,
        message: "Invalid variantId",
      };
    }

    const variant = await ProductVariant.findOne({
      _id: variantId,
      status: "active",
    }).select("_id product name sku price status");

    if (!variant) {
      return {
        success: false,
        statusCode: 400,
        message: "Variant not found or inactive",
      };
    }

    const price = Number(variant.price) || 0;
    const lineSubtotal = price * quantity;

    resolvedItems.push({
      product: variant.product,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price,
      quantity,
      subtotal: lineSubtotal,
    });

    subtotal += lineSubtotal;
  }

  if (!resolvedItems.length) {
    return {
      success: false,
      statusCode: 400,
      message: "Order must contain at least one item",
    };
  }

  const deliveryFee = Number(order.deliveryFee || 0);
  const discountAmount = Math.max(0, Number(order.discountAmount || 0));
  const totalBeforeDiscount = Math.max(0, subtotal + deliveryFee);
  const total = Math.max(0, totalBeforeDiscount - discountAmount);

  order.items = resolvedItems;
  order.subtotal = subtotal;
  order.totalBeforeDiscount = totalBeforeDiscount;
  order.total = total;
  order.isDiscounted = discountAmount > 0;

  const now = new Date();
  if (!order.metadata || typeof order.metadata !== "object")
    order.metadata = {};
  order.metadata.itemsUpdatedAt = now;
  if (actorUserId) order.metadata.itemsUpdatedBy = String(actorUserId);
  order.markModified("metadata");

  await order.save();

  return { success: true, data: order };
}

module.exports = {
  GetOrderById,
  UpdateOrderPaymentStatus,
  UpdateOrderItems,
};
