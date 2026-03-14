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
      Boolean(refreshed.refunds?.some?.((r) => r?.status === "pending"));

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

      const stripeStatus = String(refund.status || "").toLowerCase();
      const mappedStatus =
        stripeStatus === "succeeded"
          ? "succeeded"
          : stripeStatus === "failed"
            ? "failed"
            : "pending";

      refreshed.refunds = Array.isArray(refreshed.refunds)
        ? refreshed.refunds
        : [];
      refreshed.refunds.push({
        stripeRefundId: refund.id,
        paymentIntentId,
        currency: refund.currency || refreshed.currency || "GBP",
        amountMinor:
          typeof refund.amount === "number" ? refund.amount : undefined,
        amount:
          typeof refund.amount === "number" ? refund.amount / 100 : undefined,
        status: mappedStatus,
        refundedAt: mappedStatus === "succeeded" ? new Date() : undefined,
        failedAt: mappedStatus === "failed" ? new Date() : undefined,
        reason: "Order expired before payment completed",
        restock: false,
        createdAt: new Date(),
      });

      refreshed.status =
        mappedStatus === "pending" ? "refund_pending" : refreshed.status;
      refreshed.refund = {
        ...(refreshed.refund || {}),
        reason: "Order expired before payment completed",
        restock: false,
        stripeRefundId: refund.id,
        refundedAt:
          mappedStatus === "succeeded"
            ? new Date()
            : refreshed.refund?.refundedAt,
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
