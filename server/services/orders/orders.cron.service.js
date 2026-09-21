const mongoose = require("mongoose");
const Order = require("../../models/order.model");
const ProductVariant = require("../../models/variant.model");
const { reconcileReservedStock } = require("./orders.stock.service");
const { ReconcileCheckoutSession } = require("./orders.webhook.service");
const {
  sendOrderConfirmationEmailToCustomer,
} = require("./orders.notifications.service");

let _stripe;
function getStripe() {
  if (_stripe) return _stripe;
  _stripe = require("../../utils/stripe.util");
  return _stripe;
}

async function RetryRecentOrderConfirmations({ now = new Date() } = {}) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const candidates = await Order.find({
    orderType: "one_time",
    status: "paid",
    paidAt: { $gte: since },
    "metadata.orderConfirmationSentAt": { $exists: false },
  })
    .select("_id")
    .limit(20)
    .lean();

  let attempted = 0;
  for (const order of candidates) {
    try {
      await sendOrderConfirmationEmailToCustomer({ orderId: order._id });
      attempted += 1;
    } catch (err) {
      console.warn("Order confirmation retry failed", {
        orderId: String(order._id),
        error: err?.message,
      });
    }
  }

  return { attempted };
}

async function ExpirePendingOrders() {
  const now = new Date();
  let expiredCount = 0;

  // Reconcile Stripe first, outside the Mongo transaction. A paid Checkout
  // session must never be cancelled locally just because its webhook was late.
  const expiredCandidates = await Order.find({
    status: "pending",
    reservationExpiresAt: { $lte: now },
  })
    .select("_id stripeCheckoutSessionId")
    .lean();

  const safeToExpireIds = [];
  for (const candidate of expiredCandidates) {
    if (!candidate.stripeCheckoutSessionId) {
      safeToExpireIds.push(candidate._id);
      continue;
    }

    const reconciliation = await ReconcileCheckoutSession({
      checkoutSessionId: candidate.stripeCheckoutSessionId,
    });

    if (!reconciliation.success && reconciliation.message === "Payment is not complete") {
      safeToExpireIds.push(candidate._id);
      continue;
    }

    if (!reconciliation.success) {
      console.warn(
        "Skipping pending order expiry because Stripe could not be reconciled",
        {
          orderId: String(candidate._id),
          checkoutSessionId: candidate.stripeCheckoutSessionId,
          reason: reconciliation.message,
        },
      );
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const orders =
      safeToExpireIds.length > 0
        ? await Order.find({
            _id: { $in: safeToExpireIds },
            status: "pending",
            reservationExpiresAt: { $lte: now },
          }).session(session)
        : [];

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

    expiredCount = orders.length;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Order expiration cron failed:", err);
  }

  try {
    const reconciliation = await reconcileReservedStock();

    if (expiredCount > 0) {
      console.log(`Expired ${expiredCount} orders`);
    }

    if (reconciliation.updated > 0) {
      console.log(
        `Reconciled reserved stock for ${reconciliation.updated} variants`,
      );
    }
  } catch (err) {
    console.error("❌ Reserved stock reconciliation failed:", err);
  }

  try {
    await RetryRecentOrderConfirmations({ now });
  } catch (err) {
    console.error("❌ Order confirmation retry failed:", err);
  }
}

module.exports = {
  ExpirePendingOrders,
  RetryRecentOrderConfirmations,
};
