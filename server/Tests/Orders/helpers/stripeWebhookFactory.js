function checkoutSessionCompleted(orderId) {
  return {
    id: "cs_test_123",
    metadata: { orderId },
    payment_intent: "pi_test_123",
  };
}

function refundSucceeded(paymentIntentId) {
  return {
    id: "re_test_123",
    payment_intent: paymentIntentId,
    metadata: {},
  };
}

module.exports = {
  checkoutSessionCompleted,
  refundSucceeded,
};
