const mongoose = require("mongoose");
const Order = require("../models/order.model");
const ProductVariant = require("../models/variant.model");
const stripe = require("../utils/stripe.util");

async function RefundOrder({ orderId, adminUserId, reason, restock } = {}) {
  try {
    const order = await Order.findById(orderId);

    if (!order) {
      return { success: false, statusCode: 404, message: "Order not found" };
    }

    if (
      order.status === "refund_pending" ||
      order.status === "refunded" ||
      order.refund?.stripeRefundId
    ) {
      return {
        success: false,
        statusCode: 409,
        message: "Refund already initiated",
      };
    }

    if (order.status !== "paid") {
      return {
        success: false,
        statusCode: 400,
        message: "Only paid orders can be refunded",
      };
    }

    let paymentIntentId = order.stripePaymentIntentId;

    if (!paymentIntentId && order.stripeCheckoutSessionId) {
      const session = await stripe.checkout.sessions.retrieve(
        order.stripeCheckoutSessionId,
        {
          expand: ["payment_intent"],
        },
      );

      const maybePaymentIntent = session?.payment_intent;
      paymentIntentId =
        typeof maybePaymentIntent === "string"
          ? maybePaymentIntent
          : maybePaymentIntent?.id;

      if (paymentIntentId) {
        order.stripePaymentIntentId = paymentIntentId;
      }
    }

    if (!paymentIntentId) {
      return {
        success: false,
        statusCode: 400,
        message: "Missing Stripe payment reference",
      };
    }

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      metadata: {
        orderId: order._id.toString(),
      },
    });

    order.status = "refund_pending";
    order.refund = {
      ...(order.refund || {}),
      refundedBy: adminUserId,
      reason: reason || null,
      restock: Boolean(restock),
      stripeRefundId: refund.id,
    };

    await order.save();

    return {
      success: true,
      data: {
        refundId: refund.id,
        status: refund.status,
      },
    };
  } catch (err) {
    return {
      success: false,
      statusCode: 500,
      message: "Refund failed",
    };
  }
}

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

    if (!order) return null;

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

    const refundedOrderId = order._id;

    await session.commitTransaction();
    session.endSession();

    return refundedOrderId;
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
  RefundOrder,
  finalizeRefundForOrderByPaymentIntent,
  markRefundFailedByPaymentIntent,
};
