const mongoose = require("mongoose");
const Order = require("../../models/order.model");
const ProductVariant = require("../../models/variant.model");

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
  const ids = (Array.isArray(variantIds) ? variantIds : []).map(String)
    .filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
  return mongoose.connection.transaction(async session => {
    const pending = await Order.aggregate([
      { $match: { status: "pending", archived: { $ne: true } } },
      { $unwind: "$items" },
      ...(ids.length ? [{ $match: { "items.variant": { $in: ids } } }] : []),
      { $group: { _id: "$items.variant", reservedQuantity: { $sum: "$items.quantity" } } },
    ]).session(session);
    const held = await require("../../models/subscriptionStockReservation.model").aggregate([
      { $match: { state: "held" } }, { $unwind: "$remaining" },
      ...(ids.length ? [{ $match: { "remaining.variant": { $in: ids.map(String) } } }] : []),
      { $group: { _id: { $toObjectId: "$remaining.variant" }, reservedQuantity: { $sum: "$remaining.quantity" } } },
    ]).session(session);
    const totals = new Map();
    for (const entry of [...pending, ...held]) {
      const key = String(entry._id);
      const current = totals.get(key) || { _id: entry._id, reservedQuantity: 0 };
      current.reservedQuantity += Number(entry.reservedQuantity || 0);
      totals.set(key, current);
    }
    const candidates = ids.length ? ids : (await ProductVariant.find({ reservedQuantity: { $ne: 0 } })
      .select("_id").session(session).lean()).map(variant => variant._id);
    for (const id of candidates) if (!totals.has(String(id))) totals.set(String(id), { _id: id, reservedQuantity: 0 });
    if (!totals.size) return { updated: 0 };
    // Updating these same variant rows makes a concurrent checkout/reservation
    // conflict with this snapshot and retry, rather than wiping its new hold.
    const result = await ProductVariant.bulkWrite([...totals.values()].map(entry => ({ updateOne: {
      filter: { _id: entry._id }, update: { $set: { reservedQuantity: entry.reservedQuantity } },
    } })), { session });
    return { updated: Number(result.modifiedCount || 0) };
  });
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

    // When store credit was applied, Stripe's totals reflect the reduced
    // (post-credit) charge, and the credit shows up as a Stripe discount.
    // Keep our own order totals so the credit is recorded separately and the
    // order value isn't mislabelled as a discount.
    if (normalizedStripePricing && !(Number(order.creditApplied) > 0)) {
      order.currency = normalizedStripePricing.currency;
      order.subtotal = normalizedStripePricing.subtotal;
      order.total = normalizedStripePricing.total;
      order.totalBeforeDiscount = normalizedStripePricing.totalBeforeDiscount;
      order.discountAmount = normalizedStripePricing.discountAmount;
      order.isDiscounted = normalizedStripePricing.isDiscounted;
      order.paidAt = normalizedStripePricing.paidAt;
    } else {
      order.paidAt =
        normalizedStripePricing?.paidAt instanceof Date
          ? normalizedStripePricing.paidAt
          : new Date();
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
