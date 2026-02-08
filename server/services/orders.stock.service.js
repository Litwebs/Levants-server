const mongoose = require("mongoose");
const Order = require("../models/order.model");
const ProductVariant = require("../models/variant.model");

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

    order.status = "paid";
    order.paidAt = new Date();
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
};
