const stripe = require("../utils/stripe.util");
const orderService = require("../services/orders.webhook.service");

const HandleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case "checkout.session.completed":
      try {
        await orderService.HandlePaymentSuccess(event.data.object);
      } catch (err) {
        // Idempotency / eventual consistency: don't force Stripe retries forever
        if (
          err &&
          typeof err.message === "string" &&
          err.message.includes("Order not found or already processed")
        ) {
          return res.json({ received: true });
        }
        throw err;
      }
      break;

    case "checkout.session.expired":
      try {
        await orderService.HandlePaymentExpired(event.data.object);
      } catch (err) {
        return res.json({ received: true });
      }
      break;

    case "payment_intent.payment_failed":
      try {
        await orderService.HandlePaymentFailed(event.data.object);
      } catch (err) {
        return res.json({ received: true });
      }
      break;

    case "charge.refunded":
    case "refund.succeeded":
      await orderService.HandleRefundSucceeded(event.data.object);
      break;

    case "refund.failed":
      await orderService.HandleRefundFailed(event.data.object);
      break;

    default:
      break;
  }

  res.json({ received: true });
};

module.exports = {
  HandleStripeWebhook,
};
