const {
  finalizeStockForOrder,
  releaseReservedStock,
} = require("./orders.stock.service");

const Order = require("../models/order.model");
const { recordRedemption } = require("./discounts.public.service");
const {
  sendNewOrderAlertEmailToUsers,
  sendOrderConfirmationEmailToCustomer,
  sendRefundConfirmationEmailToCustomer,
} = require("./orders.notifications.service");

let _stripe;
function getStripe() {
  if (_stripe) return _stripe;
  _stripe = require("../utils/stripe.util");
  return _stripe;
}

const {
  finalizeRefundForOrderByPaymentIntent,
  markRefundFailedByPaymentIntent,
} = require("./orders.refund.service");

async function HandlePaymentSuccess(session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) return;

  const paymentIntentId = session.payment_intent;
  const stripeCheckoutSessionId = session.id;

  const order = await Order.findById(orderId);
  if (!order) return;

  // Persist Stripe references for later admin/refund workflows.
  let needsSave = false;
  if (stripeCheckoutSessionId && !order.stripeCheckoutSessionId) {
    order.stripeCheckoutSessionId = stripeCheckoutSessionId;
    needsSave = true;
  }
  if (paymentIntentId && !order.stripePaymentIntentId) {
    order.stripePaymentIntentId = paymentIntentId;
    needsSave = true;
  }
  if (needsSave) {
    await order.save();
  }

  const now = new Date();
  const isExpired =
    order.reservationExpiresAt && order.reservationExpiresAt.getTime() <= now;

  // If the order is expired or already cancelled/failed, do NOT finalize stock.
  // Instead, ensure the order is cancelled and refund the payment.
  if (order.status !== "pending" || isExpired) {
    if (order.status === "pending") {
      await releaseReservedStock(orderId, "cancelled");
    }

    if (!paymentIntentId) return;

    const refreshed = await Order.findById(orderId);
    if (!refreshed) return;

    const alreadyRefunding =
      refreshed.status === "refund_pending" ||
      refreshed.status === "refunded" ||
      Boolean(refreshed.refund?.stripeRefundId);

    if (alreadyRefunding) return;

    try {
      const stripe = getStripe();

      const refund = await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          metadata: {
            orderId: refreshed._id.toString(),
            reason: "order_expired",
          },
        },
        {
          idempotencyKey: `auto_refund_expired_order_${refreshed._id}_${paymentIntentId}`,
        },
      );

      refreshed.status = "refund_pending";
      refreshed.refund = {
        ...(refreshed.refund || {}),
        reason: "Order expired before payment completed",
        restock: false,
        stripeRefundId: refund.id,
      };

      await refreshed.save();
    } catch (err) {
      console.error("Auto-refund failed for expired order", orderId);
    }

    return;
  }

  await finalizeStockForOrder(orderId, {
    stripeCheckoutSessionId,
    stripePaymentIntentId: paymentIntentId,
  });

  // Record discount redemption (best-effort, idempotent)
  try {
    const discountId = session.metadata?.discountId;
    if (discountId) {
      await recordRedemption({
        discountId,
        customerId: order.customer,
        orderId: order._id,
        stripeCheckoutSessionId,
      });
    }
  } catch (e) {
    // Don't fail webhook processing due to redemption bookkeeping
  }

  // Notify staff/admin users about new paid order (best-effort)
  try {
    await sendNewOrderAlertEmailToUsers({ orderId: order._id });
  } catch (e) {
    // Don't fail webhook processing due to notification failures
  }

  // Notify customer about successful order/payment (best-effort, idempotent)
  try {
    await sendOrderConfirmationEmailToCustomer({ orderId: order._id });
  } catch (e) {
    // Don't fail webhook processing due to notification failures
  }
}

async function HandlePaymentExpired(session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) return;

  await releaseReservedStock(orderId, "cancelled");
}

async function HandlePaymentFailed(paymentIntent) {
  const orderId = paymentIntent.metadata?.orderId;
  if (!orderId) return;

  await releaseReservedStock(orderId, "failed");
}

async function HandleRefundSucceeded(refund) {
  if (!refund.payment_intent) return;
  const refundedOrderId = await finalizeRefundForOrderByPaymentIntent(
    refund.payment_intent,
  );

  if (!refundedOrderId) return;

  try {
    await sendRefundConfirmationEmailToCustomer({ orderId: refundedOrderId });
  } catch {
    // Don't fail webhook processing due to notification failures
  }
}

async function HandleRefundFailed(refund) {
  if (!refund.payment_intent) return;
  await markRefundFailedByPaymentIntent(refund.payment_intent);
}

module.exports = {
  HandlePaymentSuccess,
  HandlePaymentExpired,
  HandlePaymentFailed,
  HandleRefundSucceeded,
  HandleRefundFailed,
};
