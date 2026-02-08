const stripe = require("../utils/stripe.util");
const orderService = require("../services/orders.webhook.service");

const HandleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case "checkout.session.completed":
      await orderService.HandlePaymentSuccess(event.data.object);
      break;

    case "checkout.session.expired":
      await orderService.HandlePaymentExpired(event.data.object);
      break;

    case "payment_intent.payment_failed":
      await orderService.HandlePaymentFailed(event.data.object);
      break;

    default:
      break;
  }

  res.json({ received: true });
};

module.exports = {
  HandleStripeWebhook,
};
