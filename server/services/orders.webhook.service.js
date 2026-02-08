const {
  finalizeStockForOrder,
  releaseReservedStock,
} = require("./orders.stock.service");

const {
  finalizeRefundForOrderByPaymentIntent,
  markRefundFailedByPaymentIntent,
} = require("./orders.refund.service");

async function HandlePaymentSuccess(session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) return;

  await finalizeStockForOrder(orderId, {
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: session.payment_intent,
  });
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
  await finalizeRefundForOrderByPaymentIntent(refund.payment_intent);
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
