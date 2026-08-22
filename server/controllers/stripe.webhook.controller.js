const stripe = require("../utils/stripe.util");
const orderService = require("../services/orders/orders.webhook.service");
const subscriptionWebhookService = require("../services/subscriptions/subscriptionWebhook.service");

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

    case "charge.refunded": {
      // charge.refunded contains a Charge, not a Refund. Process each embedded
      // refund separately so its real re_ identifier and metadata are retained.
      const charge = event.data.object;
      for (const refund of charge.refunds?.data || []) {
        if (refund.status === "succeeded") {
          await orderService.HandleRefundSucceeded(refund);
        }
      }
      break;
    }

    case "refund.created":
    case "refund.updated":
    case "refund.succeeded":
      if (event.data.object.status === "succeeded") {
        await orderService.HandleRefundSucceeded(event.data.object);
      }
      break;

    case "refund.failed":
      await orderService.HandleRefundFailed(event.data.object);
      break;

    // ── Stripe Subscription billing events ──────────────────────────────────
    case "invoice.payment_succeeded":
      // Let processing errors return 5xx. Acknowledging a failed fulfillment
      // event makes Stripe consider it delivered and permanently loses the
      // order; a non-2xx response gives us a safe, idempotent retry.
      await subscriptionWebhookService.HandleSubscriptionInvoicePaid(
        event.data.object,
      );
      break;

    case "invoice.payment_failed":
      await subscriptionWebhookService.HandleSubscriptionInvoiceFailed(
        event.data.object,
      );
      break;

    case "customer.subscription.updated":
      await subscriptionWebhookService.HandleStripeSubscriptionUpdated(
        event.data.object,
      );
      break;

    case "customer.subscription.deleted":
      await subscriptionWebhookService.HandleStripeSubscriptionDeleted(
        event.data.object,
      );
      break;

    default:
      break;
  }

  res.json({ received: true });
};

module.exports = {
  HandleStripeWebhook,
};
