const mongoose = require("mongoose");
const Order = require("../models/order.model");
const ProductVariant = require("../models/variant.model");

function toMajorCurrencyAmount(amountMinor) {
  const normalized = Number(amountMinor);
  if (!Number.isFinite(normalized)) return null;
  return normalized / 100;
}

function normalizeStripePricing(pricing, order) {
  if (!pricing || typeof pricing !== "object") return null;

  const total = toMajorCurrencyAmount(pricing.amountTotal);
  const amountSubtotal = toMajorCurrencyAmount(pricing.amountSubtotal);
  const discountAmount = Math.max(
    0,
    toMajorCurrencyAmount(pricing.discountAmount) ?? 0,
  );

  if (total === null || amountSubtotal === null) {
    return null;
  }

  const deliveryFee = Number(order.deliveryFee || 0);
  const subtotal = Math.max(0, amountSubtotal - deliveryFee);
  const paidAt = pricing.paidAt ? new Date(pricing.paidAt) : new Date();

  return {
    currency:
      typeof pricing.currency === "string" && pricing.currency.trim()
        ? pricing.currency.trim().toUpperCase()
        : order.currency,
    subtotal,
    total,
    totalBeforeDiscount: amountSubtotal,
    discountAmount,
    isDiscounted: discountAmount > 0,
    paidAt,
  };
}

async function reconcileReservedStock({ variantIds } = {}) {
  const normalizedVariantIds = Array.isArray(variantIds)
    ? variantIds
        .map((id) => String(id || "").trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id))
    : [];

  const pendingReservations = await Order.aggregate([
    {
      $match: {
        status: "pending",
        archived: { $ne: true },
      },
    },
    { $unwind: "$items" },
    ...(normalizedVariantIds.length
      ? [{ $match: { "items.variant": { $in: normalizedVariantIds } } }]
      : []),
    {
      $group: {
        _id: "$items.variant",
        reservedQuantity: { $sum: "$items.quantity" },
      },
    },
  ]);

  const reservedByVariantId = new Map(
    pendingReservations.map((entry) => [
      String(entry._id),
      Number(entry.reservedQuantity || 0),
    ]),
  );

  const variantIdsToReset = normalizedVariantIds.length
    ? normalizedVariantIds.filter((id) => !reservedByVariantId.has(String(id)))
    : (
        await ProductVariant.find({ reservedQuantity: { $ne: 0 } })
          .select("_id")
          .lean()
      )
        .map((variant) => variant._id)
        .filter((id) => !reservedByVariantId.has(String(id)));

  const operations = [
    ...pendingReservations.map((entry) => ({
      updateOne: {
        filter: { _id: entry._id },
        update: {
          $set: {
            reservedQuantity: Number(entry.reservedQuantity || 0),
          },
        },
      },
    })),
    ...variantIdsToReset.map((variantId) => ({
      updateOne: {
        filter: { _id: variantId },
        update: {
          $set: {
            reservedQuantity: 0,
          },
        },
      },
    })),
  ];

  if (!operations.length) {
    return {
      updated: 0,
    };
  }

  const result = await ProductVariant.bulkWrite(operations, { ordered: false });

  return {
    updated: Number(result.modifiedCount || 0),
  };
}

/**
 * Convert reserved stock → sold
 */
async function finalizeStockForOrder(orderId, stripeRefs = {}) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findOne({
      _id: orderId,
      status: "pending",
    }).session(session);

    if (!order) {
      throw new Error("Order not found or already processed");
    }

    for (const item of order.items) {
      await ProductVariant.findByIdAndUpdate(
        item.variant,
        {
          $inc: {
            stockQuantity: -item.quantity,
            reservedQuantity: -item.quantity,
          },
        },
        { session },
      );
    }

    if (stripeRefs.stripeCheckoutSessionId) {
      order.stripeCheckoutSessionId ??= stripeRefs.stripeCheckoutSessionId;
    }

    if (stripeRefs.stripePaymentIntentId) {
      order.stripePaymentIntentId ??= stripeRefs.stripePaymentIntentId;
    }

    const normalizedStripePricing = normalizeStripePricing(
      stripeRefs.stripePricing,
      order,
    );

    if (normalizedStripePricing) {
      order.currency = normalizedStripePricing.currency;
      order.subtotal = normalizedStripePricing.subtotal;
      order.total = normalizedStripePricing.total;
      order.totalBeforeDiscount = normalizedStripePricing.totalBeforeDiscount;
      order.discountAmount = normalizedStripePricing.discountAmount;
      order.isDiscounted = normalizedStripePricing.isDiscounted;
      order.paidAt = normalizedStripePricing.paidAt;
    } else {
      order.paidAt = new Date();
    }

    order.status = "paid";
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

/**
 * Release reserved stock
 */
async function releaseReservedStock(orderId, status) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findOne({
      _id: orderId,
      status: "pending",
    }).session(session);

    if (!order) return;

    for (const item of order.items) {
      await ProductVariant.findByIdAndUpdate(
        item.variant,
        { $inc: { reservedQuantity: -item.quantity } },
        { session },
      );
    }

    order.status = status;
    order.expiresAt = new Date();
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

module.exports = {
  finalizeStockForOrder,
  releaseReservedStock,
  reconcileReservedStock,
};
