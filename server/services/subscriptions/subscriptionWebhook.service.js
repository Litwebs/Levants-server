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
const Payment = require("../../models/payment.model");
const CustomerNotification = require("../../models/customerNotification.model");
const logger = require("../../utils/logger.util");
const stripe = require("../../utils/stripe.util");
const {
  sendSubscriptionUpdateEmail,
} = require("../customerPortal/subscriptionEmailNotifications.service");

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

const SUBSCRIPTION_DELIVERY_FEE = 1;

const BILLING_WINDOW_DAYS = {
  weekly: 7,
  every_two_weeks: 14,
  monthly: 30,
};

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = startOfDay(value);
  date.setDate(date.getDate() + 1);
  return date;
}

function addBillingWindowDays(date, frequency) {
  const next = new Date(date);
  next.setDate(next.getDate() + (BILLING_WINDOW_DAYS[frequency] || 7));
  return next;
}

function resolveOrderItemsForDelivery(subscription, deliveryDate) {
  const deliveryWeekday = new Date(deliveryDate).getDay();
  const dayPlan = Array.isArray(subscription.deliveryDayPlans)
    ? subscription.deliveryDayPlans.find(
        (plan) => Number(plan?.day) === Number(deliveryWeekday),
      )
    : null;

  return dayPlan?.items && dayPlan.items.length > 0
    ? dayPlan.items
    : subscription.items;
}

async function findDeliverySlot(subscriptionId, deliveryDate) {
  return SubscriptionDelivery.findOne({
    subscription: subscriptionId,
    scheduledDate: {
      $gte: startOfDay(deliveryDate),
      $lt: endOfDay(deliveryDate),
    },
  });
}

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

  const alreadyProcessed = await Order.exists({
    stripeInvoiceId: invoice.id,
    subscription: subscription._id,
  });
  if (alreadyProcessed) {
    logger.info(
      `[SubscriptionWebhook] Invoice ${invoice.id} already processed for subscription ${subscription.subscriptionNumber}`,
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

  const billingWindowStart = subscription.nextDeliveryDate
    ? new Date(subscription.nextDeliveryDate)
    : new Date((invoice.period_start || Math.floor(Date.now() / 1000)) * 1000);
  const billingWindowEnd = addBillingWindowDays(
    billingWindowStart,
    subscription.frequency,
  );

  const deliverySlots = await SubscriptionDelivery.find({
    subscription: subscription._id,
    status: { $in: ["scheduled", "generated"] },
    scheduledDate: {
      $gte: startOfDay(billingWindowStart),
      $lt: startOfDay(billingWindowEnd),
    },
  }).sort({ scheduledDate: 1 });

  if (deliverySlots.length === 0) {
    deliverySlots.push({
      subscription: subscription._id,
      customer: subscription.customer._id,
      scheduledDate: new Date(billingWindowStart),
      status: "scheduled",
    });
  }

  const paidAt = invoice.status_transitions?.paid_at
    ? new Date(invoice.status_transitions.paid_at * 1000)
    : new Date();
  const stripePaymentIntentId =
    typeof invoice.payment_intent === "string" ? invoice.payment_intent : null;

  const createdOrders = [];
  for (const slot of deliverySlots.sort(
    (a, b) =>
      new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime(),
  )) {
    const deliveryDate = new Date(slot.scheduledDate);

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

    const existing = await Order.findOne({
      stripeInvoiceId: invoice.id,
      subscription: subscription._id,
      deliveryDate: {
        $gte: startOfDay(deliveryDate),
        $lt: endOfDay(deliveryDate),
      },
    });

    if (existing) {
      const existingSlot = await findDeliverySlot(
        subscription._id,
        deliveryDate,
      );
      if (existingSlot && !existingSlot.order) {
        existingSlot.status = "generated";
        existingSlot.order = existing._id;
        existingSlot.generatedAt = existingSlot.generatedAt || new Date();
        await existingSlot.save();
      }
      createdOrders.push(existing);
      continue;
    }

    const sourceItems = resolveOrderItemsForDelivery(
      subscription,
      deliveryDate,
    );
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
    const deliveryFee = SUBSCRIPTION_DELIVERY_FEE;
    const total = subtotal + deliveryFee;
    const amountPaid = total;

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
      deliveryFee,
      subtotal,
      total,
      amountPaid,
      status: "paid",
      deliveryStatus: "ordered",
      orderType: "subscription_generated",
      subscription: subscription._id,
      stripePaymentIntentId,
      stripeInvoiceId: invoice.id,
      paymentAllocations: stripePaymentIntentId
        ? [
            {
              paymentIntentId: stripePaymentIntentId,
              stripeInvoiceId: invoice.id,
              source: "subscription_invoice",
              amountMinor: Math.round(amountPaid * 100),
            },
          ]
        : [],
      paidAt,
      reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const deliverySlot = await findDeliverySlot(subscription._id, deliveryDate);
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

    await Payment.create({
      customer: subscription.customer._id,
      order: order._id,
      subscription: subscription._id,
      amount: total,
      currency: invoice.currency || "gbp",
      status: "paid",
      providerReference: stripePaymentIntentId || null,
      paidAt,
    });

    createdOrders.push(order);
  }

  subscription.nextDeliveryDate = billingWindowEnd;

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
    message:
      createdOrders.length > 1
        ? `Your subscription orders have been created for ${createdOrders.length} delivery days in this billing cycle.`
        : `Your subscription order #${createdOrders[0].orderId} has been created for ${createdOrders[0].deliveryDate.toLocaleDateString("en-GB")}.`,
    relatedOrder: createdOrders[0]?._id,
    relatedSubscription: subscription._id,
  });

  logger.info(
    `[SubscriptionWebhook] Created ${createdOrders.length} order(s) from invoice ${invoice.id} (subscription ${subscription.subscriptionNumber})`,
  );
}

/**
 * invoice.payment_failed
 *
 * Stripe couldn't charge the subscription. Pause it immediately and notify the customer.
 */
async function HandleSubscriptionInvoiceFailed(eventInvoice) {
  const invoice = await resolveLegacyInvoice(eventInvoice);
  if (!invoice.subscription) return;

  const subscription = await Subscription.findOne({
    stripeSubscriptionId: invoice.subscription,
  });
  if (!subscription) return;

  // Pause Stripe billing to stop future charges while the customer fixes their payment.
  if (subscription.stripeSubscriptionId && subscription.status === "active") {
    try {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        pause_collection: { behavior: "void" },
      });
    } catch (err) {
      logger.error(
        `[SubscriptionWebhook] Failed to pause Stripe subscription ${subscription.stripeSubscriptionId} after payment failure: ${err.message}`,
      );
    }

    subscription.status = "paused";
    subscription.pausedAt = subscription.pausedAt || new Date();
    await subscription.save();
  }

  await CustomerNotification.create({
    customer: subscription.customer,
    type: "payment_failed",
    title: "Subscription paused – payment failed",
    message:
      "We couldn't charge your payment method, so your subscription has been paused. Please update your payment details in the Payments section to resume.",
    relatedSubscription: subscription._id,
  });

  try {
    await sendSubscriptionUpdateEmail({
      customerId: subscription.customer,
      subscription,
      subject: "Your subscription has been paused",
      title: "Subscription paused – payment failed",
      message:
        "We were unable to process your subscription payment, so your deliveries have been paused. Please visit your portal to update your payment method and resume.",
    });
  } catch (err) {
    logger.error(
      `[SubscriptionWebhook] Failed to send payment-failed email: ${err.message}`,
    );
  }

  logger.warn(
    `[SubscriptionWebhook] Payment failed for subscription ${subscription.subscriptionNumber}, invoice ${invoice.id} — subscription paused`,
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
    // Stripe is cancelled immediately to stop future invoices, while the local
    // subscription deliberately stays active until its cut-off-locked delivery
    // has completed. The daily finalizer owns that transition.
    if (subscription.isCancellationScheduled) return;
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

  // See HandleStripeSubscriptionUpdated: deletion is expected for a deferred
  // cancellation and must not cancel the already committed delivery.
  if (subscription.isCancellationScheduled) return;

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
