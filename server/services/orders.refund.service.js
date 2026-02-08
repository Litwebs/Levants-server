const mongoose = require("mongoose");
const Order = require("../models/order.model");
const ProductVariant = require("../models/variant.model");

/**
 * Stripe refund succeeded
 */
async function finalizeRefundForOrderByPaymentIntent(paymentIntentId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findOne({
      stripePaymentIntentId: paymentIntentId,
      status: "refund_pending",
    }).session(session);

    if (!order) return;

    if (order.refund?.restock === true) {
      for (const item of order.items) {
        await ProductVariant.findByIdAndUpdate(
          item.variant,
          { $inc: { stockQuantity: item.quantity } },
          { session },
        );
      }
    }

    order.status = "refunded";
    order.refund.refundedAt = new Date();
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
 * Stripe refund failed
 */
async function markRefundFailedByPaymentIntent(paymentIntentId) {
  await Order.findOneAndUpdate(
    {
      stripePaymentIntentId: paymentIntentId,
      status: "refund_pending",
    },
    { status: "refund_failed" },
  );
}

module.exports = {
  finalizeRefundForOrderByPaymentIntent,
  markRefundFailedByPaymentIntent,
};
