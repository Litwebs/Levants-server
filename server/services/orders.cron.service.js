const mongoose = require("mongoose");
const Order = require("../models/order.model");
const ProductVariant = require("../models/variant.model");

let _stripe;
function getStripe() {
  if (_stripe) return _stripe;
  _stripe = require("../utils/stripe.util");
  return _stripe;
}

async function ExpirePendingOrders() {
  const now = new Date();

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const orders = await Order.find({
      status: "pending",
      reservationExpiresAt: { $lte: now },
    }).session(session);

    const checkoutSessionsToExpire = [];

    for (const order of orders) {
      if (order.stripeCheckoutSessionId) {
        checkoutSessionsToExpire.push(order.stripeCheckoutSessionId);
      }

      for (const item of order.items) {
        await ProductVariant.findByIdAndUpdate(
          item.variant,
          { $inc: { reservedQuantity: -item.quantity } },
          { session },
        );
      }

      order.status = "cancelled";
      order.expiresAt = now;
      await order.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    // Best-effort: expire Stripe Checkout sessions so customers can't pay
    // for an order we just cancelled.
    if (checkoutSessionsToExpire.length > 0) {
      for (const sessionId of checkoutSessionsToExpire) {
        try {
          const stripe = getStripe();
          if (stripe?.checkout?.sessions?.expire) {
            await stripe.checkout.sessions.expire(sessionId);
          }
        } catch (err) {
          console.warn("Failed to expire Stripe session", sessionId);
        }
      }
    }

    if (orders.length > 0) {
      console.log(`Expired ${orders.length} orders`);
    }
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Order expiration cron failed:", err);
  }
}

module.exports = {
  ExpirePendingOrders,
};
