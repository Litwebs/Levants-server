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

const {
  finalizeRefundForOrderByPaymentIntent,
  markRefundFailedByPaymentIntent,
  applyStripeRefundSucceeded,
  applyStripeRefundFailed,
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

  // Already finalized or in refund flow: do nothing.
  if (
    order.status === "paid" ||
    order.status === "refund_pending" ||
    order.status === "refunded" ||
    order.status === "partially_refunded"
  ) {
    return;
  }

  // No auto-refund.
  // If the order was already cancelled/failed by another process,
  // just record the Stripe references above and exit safely.
  if (order.status === "cancelled" || order.status === "failed") {
    console.warn(
      "Payment completed for non-pending order; skipping auto-refund/finalization",
      {
        orderId: String(order._id),
        status: order.status,
        stripeCheckoutSessionId,
        paymentIntentId,
      },
    );
    return;
  }

  // Only pending orders should be finalized.
  if (order.status !== "pending") {
    console.warn("Payment completed for unexpected order status; skipping", {
      orderId: String(order._id),
      status: order.status,
      stripeCheckoutSessionId,
      paymentIntentId,
    });
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

  // Prefer the partial-refund-aware path when refund.id is present.
  const refundedOrderId = refund.id
    ? await applyStripeRefundSucceeded({
        paymentIntentId: refund.payment_intent,
        stripeRefundId: refund.id,
        amountMinor: refund.amount,
        currency: refund.currency,
      })
    : await finalizeRefundForOrderByPaymentIntent(refund.payment_intent);

  if (!refundedOrderId) return;

  try {
    await sendRefundConfirmationEmailToCustomer({ orderId: refundedOrderId });
  } catch {
    // Don't fail webhook processing due to notification failures
  }
}

async function HandleRefundFailed(refund) {
  if (!refund.payment_intent) return;

  if (refund.id) {
    await applyStripeRefundFailed({
      paymentIntentId: refund.payment_intent,
      stripeRefundId: refund.id,
      amountMinor: refund.amount,
      currency: refund.currency,
    });
    return;
  }

  await markRefundFailedByPaymentIntent(refund.payment_intent);
}

module.exports = {
  HandlePaymentSuccess,
  HandlePaymentExpired,
  HandlePaymentFailed,
  HandleRefundSucceeded,
  HandleRefundFailed,
};
