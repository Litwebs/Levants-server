"use strict";

const mongoose = require("mongoose");

const Order = require("../../models/order.model");
const ProductVariant = require("../../models/variant.model");

const { buildActiveOrderIdQuery } = require("../../utils/ordersAdmin.util");

const MANUAL_IMPORT_DELIVERY_FEE = 1;

async function GetOrderById({ orderId }) {
  const order = await Order.findOne(buildActiveOrderIdQuery(orderId)).populate(
    "customer",
  );

  if (!order) {
    return { success: false, message: "Order not found" };
  }

  return { success: true, data: order };
}

async function UpdateOrderPaymentStatus({
  orderId,
  paid,
  amountPaid,
  actorUserId,
} = {}) {
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
    const orderTotal = Number(order.total) || 0;
    const parsedAmount =
      amountPaid !== undefined && amountPaid !== null
        ? Number(amountPaid)
        : null;

    if (parsedAmount !== null && !Number.isFinite(parsedAmount)) {
      return { success: false, statusCode: 400, message: "Invalid amountPaid" };
    }
    if (parsedAmount !== null && parsedAmount < 0) {
      return {
        success: false,
        statusCode: 400,
        message: "amountPaid cannot be negative",
      };
    }

    const isPartial =
      parsedAmount !== null && orderTotal > 0 && parsedAmount < orderTotal;

    order.status = isPartial ? "partially_paid" : "paid";
    order.amountPaid = parsedAmount !== null ? parsedAmount : orderTotal;
    order.paidAt = order.paidAt || now;
  } else {
    order.status = "unpaid";
    order.paidAt = undefined;
    order.amountPaid = undefined;
  }

  if (!order.metadata || typeof order.metadata !== "object")
    order.metadata = {};
  order.metadata.paymentStatusUpdatedAt = now;
  if (actorUserId) order.metadata.paymentStatusUpdatedBy = String(actorUserId);
  order.markModified("metadata");

  await order.save();

  return { success: true, data: order };
}

async function UpdateOrderItems({
  orderId,
  items,
  importedBaseTotal,
  includeDeliveryFee,
  actorUserId,
} = {}) {
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

  const isManualImport = Boolean(order?.metadata?.manualImport);

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

  const deliveryFee = isManualImport
    ? MANUAL_IMPORT_DELIVERY_FEE
    : Number(order.deliveryFee || 0);
  const discountAmount = Math.max(0, Number(order.discountAmount || 0));
  const parsedImportedBaseTotal =
    importedBaseTotal === undefined || importedBaseTotal === null
      ? null
      : Number(importedBaseTotal);

  if (
    parsedImportedBaseTotal !== null &&
    !Number.isFinite(parsedImportedBaseTotal)
  ) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid importedBaseTotal",
    };
  }

  const inferredIncludedDeliveryFee =
    Math.abs(
      Number(order.total || 0) -
        Math.max(0, Number(order.subtotal || 0) + deliveryFee - discountAmount),
    ) < 0.000001;
  const hasSavedImportedBaseTotal = Number.isFinite(
    Number(order?.metadata?.importedBaseTotal),
  );
  const previousIncludedDeliveryFee =
    typeof order?.metadata?.includeDeliveryFeeInTotal === "boolean"
      ? order.metadata.includeDeliveryFeeInTotal
      : inferredIncludedDeliveryFee;
  // If the frontend sent an explicit importedBaseTotal it already includes any
  // item-subtotal delta, so use it directly.  Only re-derive via delta when no
  // value is supplied (e.g. first edit of a legacy order).
  const resolvedImportedBaseTotal = (() => {
    if (parsedImportedBaseTotal !== null) return parsedImportedBaseTotal;
    const savedBase = hasSavedImportedBaseTotal
      ? Math.max(0, Number(order.metadata.importedBaseTotal || 0))
      : Math.max(
          0,
          Number(order.total || 0) -
            (previousIncludedDeliveryFee ? deliveryFee : 0),
        );
    const adjustment = Math.max(
      0 - subtotal,
      savedBase - Math.max(0, Number(order.subtotal || 0)),
    );
    return Math.max(0, subtotal + adjustment);
  })();
  const shouldIncludeDeliveryFee =
    typeof includeDeliveryFee === "boolean"
      ? includeDeliveryFee
      : previousIncludedDeliveryFee;
  const shouldUseImportedPricing =
    isManualImport &&
    (parsedImportedBaseTotal !== null ||
      hasSavedImportedBaseTotal ||
      !inferredIncludedDeliveryFee);

  const totalBeforeDiscount = shouldUseImportedPricing
    ? Math.max(
        0,
        resolvedImportedBaseTotal +
          (shouldIncludeDeliveryFee ? deliveryFee : 0),
      )
    : Math.max(0, subtotal + deliveryFee);
  const total = Math.max(0, totalBeforeDiscount - discountAmount);

  order.items = resolvedItems;
  order.subtotal = subtotal;
  order.deliveryFee = deliveryFee;
  order.totalBeforeDiscount = totalBeforeDiscount;
  order.total = total;
  order.isDiscounted = discountAmount > 0;

  const now = new Date();
  if (!order.metadata || typeof order.metadata !== "object")
    order.metadata = {};
  if (isManualImport) {
    order.metadata.includeDeliveryFeeInTotal = shouldIncludeDeliveryFee;
    if (Math.abs(resolvedImportedBaseTotal - subtotal) < 0.000001) {
      delete order.metadata.importedBaseTotal;
    } else {
      order.metadata.importedBaseTotal = resolvedImportedBaseTotal;
    }
  }
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
