"use strict";

/**
 * Handles Stripe webhook events related to subscriptions.
 *
 * Stripe is the source of truth for billing. When Stripe successfully
 * charges a subscription invoice, we create an Order in our DB.
 * All status transitions (pause/resume/cancel) are initiated from our API
 * and reflected back via webhooks for idempotent sync.
 */

const Subscription = require("../../models/subscription.model");
const SubscriptionDelivery = require("../../models/subscriptionDelivery.model");
const Order = require("../../models/order.model");
const CustomerNotification = require("../../models/customerNotification.model");
const logger = require("../../utils/logger.util");
const stripe = require("../../utils/stripe.util");

/**
 * Webhook events can be delivered in a newer Stripe API shape (2025+/clover)
 * where `invoice.subscription` and `invoice.payment_intent` no longer exist at
 * the top level (they moved under `invoice.parent` / `invoice.payments`).
 * Re-retrieving the invoice through our pinned SDK version returns the legacy
 * shape with those fields populated, so the rest of the handler can stay
 * version-agnostic.
 */
async function resolveLegacyInvoice(eventInvoice) {
  if (!eventInvoice || !eventInvoice.id) return eventInvoice;
  // Already in legacy shape (e.g. tests or older API) — no need to re-fetch.
  if (typeof eventInvoice.subscription === "string") return eventInvoice;
  try {
    return await stripe.invoices.retrieve(eventInvoice.id);
  } catch (err) {
    logger.warn(
      `[SubscriptionWebhook] Could not re-retrieve invoice ${eventInvoice.id}: ${err.message}`,
    );
    return eventInvoice;
  }
}
const {
  addFrequencyDays,
  scheduleUpcomingDeliveries,
  promotePendingChanges,
  syncStripeSubscriptionPrice,
} = require("../customerPortal/customerSubscriptions.service");

/**
 * invoice.payment_succeeded
 *
 * Fires when Stripe successfully charges a subscription invoice.
 * We create an Order in our DB for fulfillment.
 */
async function HandleSubscriptionInvoicePaid(eventInvoice) {
  const invoice = await resolveLegacyInvoice(eventInvoice);
  if (!invoice.subscription) return; // Not a subscription invoice

  const subscription = await Subscription.findOne({
    stripeSubscriptionId: invoice.subscription,
  }).populate("customer");

  if (!subscription) {
    logger.warn(
      `[SubscriptionWebhook] No local subscription found for Stripe sub ${invoice.subscription}`,
    );
    return;
  }

  if (!subscription.customer) {
    logger.warn(
      `[SubscriptionWebhook] Subscription ${subscription._id} has no populated customer`,
    );
    return;
  }

  // Idempotency guard — skip if order already created for this invoice
  const existing = await Order.findOne({ stripeInvoiceId: invoice.id });
  if (existing) {
    logger.info(
      `[SubscriptionWebhook] Order already exists for invoice ${invoice.id}, skipping`,
    );
    return;
  }

  // Try to geocode the delivery address; fall back to 0,0
  let location = { lat: 0, lng: 0 };
  try {
    const { geocodeAddress } = require("../../Integration/google.geocode");
    location = await geocodeAddress(subscription.deliveryAddress);
  } catch {
    // Non-fatal
  }

  // The first invoice (subscription_create) pre-pays the upcoming delivery, so
  // nextDeliveryDate already points at it — leave it as-is. Every later
  // (recurring) invoice pays for the FOLLOWING delivery, so advance first. The
  // order created below is always for the current nextDeliveryDate, which stays
  // pointing at the upcoming, pre-paid, editable delivery.
  const isCreateInvoice = invoice.billing_reason === "subscription_create";
  if (!isCreateInvoice && subscription.nextDeliveryDate) {
    subscription.nextDeliveryDate = addFrequencyDays(
      subscription.nextDeliveryDate,
      subscription.frequency,
      subscription.preferredDeliveryDays || [subscription.preferredDeliveryDay],
    );
  }

  const deliveryDate =
    subscription.nextDeliveryDate ||
    new Date((invoice.period_end || Math.floor(Date.now() / 1000)) * 1000);

  // Promote any post-cut-off edits that take effect from THIS delivery BEFORE we
  // snapshot the order items, so the order reflects exactly what was billed. The
  // Stripe price was already updated when the change was staged, so this
  // invoice already charged the new amount.
  try {
    const pendingEffectiveFrom = subscription.pendingChanges?.effectiveFrom;
    if (
      subscription.pendingChanges &&
      (!pendingEffectiveFrom ||
        new Date(pendingEffectiveFrom).getTime() <= deliveryDate.getTime())
    ) {
      await promotePendingChanges(subscription);
    }
  } catch (err) {
    logger.error(
      `[SubscriptionWebhook] Promoting pending changes failed for ${subscription.subscriptionNumber}: ${err.message}`,
    );
  }

  const deliveryWeekday = new Date(deliveryDate).getDay();
  const dayPlan = Array.isArray(subscription.deliveryDayPlans)
    ? subscription.deliveryDayPlans.find(
        (plan) => Number(plan?.day) === Number(deliveryWeekday),
      )
    : null;

  // Build order items from the (possibly just-promoted) subscription snapshot.
  // For multi-day weekly plans, use the day-specific item plan.
  const sourceItems =
    dayPlan?.items && dayPlan.items.length > 0
      ? dayPlan.items
      : subscription.items;

  const orderItems = sourceItems.map((item) => ({
    product: item.product,
    variant: item.variant,
    name: item.name,
    sku: item.sku,
    price: item.unitPrice,
    quantity: item.quantity,
    subtotal: item.unitPrice * item.quantity,
  }));

  const subtotal = orderItems.reduce((sum, i) => sum + i.subtotal, 0);
  const total = subtotal;

  const amountPaid =
    typeof invoice.amount_paid === "number" ? invoice.amount_paid / 100 : total;

  const stripePaymentIntentId =
    typeof invoice.payment_intent === "string" ? invoice.payment_intent : null;

  const paidAt = invoice.status_transitions?.paid_at
    ? new Date(invoice.status_transitions.paid_at * 1000)
    : new Date();

  const order = await Order.create({
    customer: subscription.customer._id,
    items: orderItems,
    deliveryAddress: {
      line1: subscription.deliveryAddress.line1,
      line2: subscription.deliveryAddress.line2 || null,
      city: subscription.deliveryAddress.city,
      postcode: subscription.deliveryAddress.postcode,
      country: subscription.deliveryAddress.country,
    },
    customerInstructions:
      subscription.deliveryAddress.deliveryInstructions || "",
    location,
    deliveryDate,
    deliveryFee: 0,
    subtotal,
    total,
    amountPaid,
    status: "paid",
    deliveryStatus: "ordered",
    orderType: "subscription_generated",
    subscription: subscription._id,
    stripePaymentIntentId,
    stripeInvoiceId: invoice.id,
    paidAt,
    reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  // Update or create delivery slot
  const deliverySlot = await SubscriptionDelivery.findOne({
    subscription: subscription._id,
    scheduledDate: {
      $gte: new Date(deliveryDate.getTime() - 12 * 60 * 60 * 1000),
      $lte: new Date(deliveryDate.getTime() + 12 * 60 * 60 * 1000),
    },
  });

  if (deliverySlot) {
    deliverySlot.status = "generated";
    deliverySlot.order = order._id;
    deliverySlot.generatedAt = new Date();
    await deliverySlot.save();
  } else {
    await SubscriptionDelivery.create({
      subscription: subscription._id,
      customer: subscription.customer._id,
      order: order._id,
      scheduledDate: deliveryDate,
      status: "generated",
      generatedAt: new Date(),
    });
  }

  // nextDeliveryDate was already advanced above for recurring invoices (and
  // intentionally left in place for the first, pre-paid invoice).

  // Safety net: if a deferred price sync was ever queued, apply it now so
  // future deliveries bill the new amount.
  if (subscription.pendingPriceSync) {
    subscription.pendingPriceSync = false;
    await subscription.save();
    try {
      await syncStripeSubscriptionPrice(subscription);
    } catch (err) {
      logger.error(
        `[SubscriptionWebhook] Deferred price sync failed for ${subscription.subscriptionNumber}: ${err.message}`,
      );
    }
  } else {
    await subscription.save();
  }

  await scheduleUpcomingDeliveries(subscription);

  // Notify customer
  await CustomerNotification.create({
    customer: subscription.customer._id,
    type: "subscription_upcoming_delivery",
    title: "Subscription order confirmed",
    message: `Your subscription order #${order.orderId} has been created for ${deliveryDate.toLocaleDateString("en-GB")}.`,
    relatedOrder: order._id,
    relatedSubscription: subscription._id,
  });

  logger.info(
    `[SubscriptionWebhook] Created order ${order.orderId} from invoice ${invoice.id} (subscription ${subscription.subscriptionNumber})`,
  );
}

/**
 * invoice.payment_failed
 *
 * Stripe couldn't charge the subscription. Notify the customer.
 */
async function HandleSubscriptionInvoiceFailed(eventInvoice) {
  const invoice = await resolveLegacyInvoice(eventInvoice);
  if (!invoice.subscription) return;

  const subscription = await Subscription.findOne({
    stripeSubscriptionId: invoice.subscription,
  });
  if (!subscription) return;

  await CustomerNotification.create({
    customer: subscription.customer,
    type: "payment_failed",
    title: "Subscription payment failed",
    message:
      "We couldn't charge your payment method for your subscription. Please update your payment details in the Payments section.",
    relatedSubscription: subscription._id,
  });

  logger.warn(
    `[SubscriptionWebhook] Payment failed for subscription ${subscription.subscriptionNumber}, invoice ${invoice.id}`,
  );
}

/**
 * customer.subscription.updated
 *
 * Syncs Stripe's subscription status back to our DB.
 * This is a safety net — status changes should already be applied
 * by our API before Stripe reflects them, but this ensures consistency.
 */
async function HandleStripeSubscriptionUpdated(stripeSub) {
  const subscription = await Subscription.findOne({
    stripeSubscriptionId: stripeSub.id,
  });
  if (!subscription) return;

  let changed = false;

  if (stripeSub.status === "canceled") {
    if (subscription.status !== "cancelled") {
      subscription.status = "cancelled";
      subscription.cancelledAt = subscription.cancelledAt || new Date();
      changed = true;
    }
  } else if (stripeSub.pause_collection) {
    if (subscription.status !== "paused") {
      subscription.status = "paused";
      subscription.pausedAt = subscription.pausedAt || new Date();
      changed = true;
    }
  } else if (stripeSub.status === "active" || stripeSub.status === "trialing") {
    if (subscription.status === "paused") {
      subscription.status = "active";
      subscription.pausedAt = null;
      changed = true;
    }
  }

  if (changed) {
    await subscription.save();
    logger.info(
      `[SubscriptionWebhook] Synced status for subscription ${subscription.subscriptionNumber} → ${subscription.status}`,
    );
  }
}

/**
 * customer.subscription.deleted
 *
 * Stripe subscription was deleted (cancelled and past end of period).
 */
async function HandleStripeSubscriptionDeleted(stripeSub) {
  const subscription = await Subscription.findOne({
    stripeSubscriptionId: stripeSub.id,
  });
  if (!subscription) return;

  if (subscription.status !== "cancelled") {
    subscription.status = "cancelled";
    subscription.cancelledAt = subscription.cancelledAt || new Date();
    await subscription.save();

    await SubscriptionDelivery.updateMany(
      { subscription: subscription._id, status: "scheduled" },
      { $set: { status: "cancelled" } },
    );

    logger.info(
      `[SubscriptionWebhook] Subscription ${subscription.subscriptionNumber} marked cancelled via Stripe deletion`,
    );
  }
}

module.exports = {
  HandleSubscriptionInvoicePaid,
  HandleSubscriptionInvoiceFailed,
  HandleStripeSubscriptionUpdated,
  HandleStripeSubscriptionDeleted,
};
