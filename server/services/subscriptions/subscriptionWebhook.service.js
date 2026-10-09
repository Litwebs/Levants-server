"use strict";

/**
 * Handles Stripe webhook events related to subscriptions.
 *
 * Stripe is the source of truth for billing. When Stripe successfully
 * charges a subscription invoice, we create an Order in our DB.
 * All status transitions (pause/resume/cancel) are initiated from our API
 * and reflected back via webhooks for idempotent sync.
 */

const { withSubscriptionLifecycleLock } = require("./subscriptionLifecycleLock.service");
const mongoose = require("mongoose");
const InvoiceFulfillment = require("../../models/subscriptionInvoiceFulfillment.model");
const { freezeInvoiceFulfillment } = require("./subscriptionInvoiceFulfillment.service");
const Subscription = require("../../models/subscription.model");
const SubscriptionDelivery = require("../../models/subscriptionDelivery.model");
const Order = require("../../models/order.model");
const Payment = require("../../models/payment.model");
const { saveInvoicePayment } = require("./subscriptionInvoicePayment.service");
const CustomerNotification = require("../../models/customerNotification.model");
const logger = require("../../utils/logger.util");
const stripe = require("../../utils/stripe.util");
const { selectInvoicesForRecovery } = require("./subscriptionInvoiceRecovery.util");
const {
  addCalendarMonthPreservingWeekdayOccurrence,
} = require("../../utils/subscriptionCadence.util");
const {
  SUBSCRIPTION_TIME_ZONE,
  addCalendarDaysInTimeZone,
  startOfDayInTimeZone,
  weekdayInTimeZone,
} = require("../../utils/subscriptionCutoff.util");
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
    const retrieved = await stripe.invoices.retrieve(eventInvoice.id);
    // Preserve new-shape parent/payment references if the account-pinned
    // retrieve response omits them, while preferring the fuller retrieved data.
    return {
      ...eventInvoice,
      ...retrieved,
      parent: retrieved?.parent || eventInvoice.parent,
      payments: retrieved?.payments || eventInvoice.payments,
    };
  } catch (err) {
    logger.warn(
      `[SubscriptionWebhook] Could not re-retrieve invoice ${eventInvoice.id}: ${err.message}`,
    );
    return eventInvoice;
  }
}

function resolveInvoiceSubscriptionId(invoice) {
  const legacy = invoice?.subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy?.id) return legacy.id;

  const parentSubscription =
    invoice?.parent?.subscription_details?.subscription;
  if (typeof parentSubscription === "string") return parentSubscription;
  return parentSubscription?.id || null;
}

function resolveInvoicePaymentIntentId(invoice) {
  const legacy = invoice?.payment_intent;
  if (typeof legacy === "string") return legacy;
  if (legacy?.id) return legacy.id;

  for (const invoicePayment of invoice?.payments?.data || []) {
    const paymentIntent = invoicePayment?.payment?.payment_intent;
    if (typeof paymentIntent === "string") return paymentIntent;
    if (paymentIntent?.id) return paymentIntent.id;
  }
  return null;
}

async function findLocalSubscription(stripeSubscriptionId) {
  let subscription = await Subscription.findOne({
    stripeSubscriptionId,
  }).populate("customer");
  if (subscription) return subscription;

  // Creation metadata is written before Stripe takes payment. It lets a retry
  // recover the local identity even when the first webhook arrived before the
  // local document finished saving.
  try {
    const remote = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const localId = remote?.metadata?.subscriptionId;
    if (localId) {
      subscription = await Subscription.findById(localId).populate("customer");
      if (subscription && !subscription.stripeSubscriptionId) {
        subscription.stripeSubscriptionId = stripeSubscriptionId;
        await subscription.save();
      }
    }
  } catch (err) {
    logger.warn(
      `[SubscriptionWebhook] Could not resolve Stripe subscription ${stripeSubscriptionId}: ${err.message}`,
    );
  }

  return subscription;
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
};

function startOfDay(value) {
  return startOfDayInTimeZone(value, SUBSCRIPTION_TIME_ZONE);
}

function endOfDay(value) {
  return addCalendarDaysInTimeZone(
    startOfDay(value),
    1,
    SUBSCRIPTION_TIME_ZONE,
  );
}

function addBillingWindowDays(date, frequency, preferredDeliveryDay) {
  if (frequency === "monthly") {
    return addCalendarMonthPreservingWeekdayOccurrence(
      date,
      preferredDeliveryDay ??
        weekdayInTimeZone(date, SUBSCRIPTION_TIME_ZONE),
      SUBSCRIPTION_TIME_ZONE,
    );
  }

  return addCalendarDaysInTimeZone(
    date,
    BILLING_WINDOW_DAYS[frequency] || 7,
    SUBSCRIPTION_TIME_ZONE,
  );
}

function isPaymentFailurePause(subscription) {
  if (subscription.status !== "paused") return false;
  if (subscription.pauseReason === "payment_failed") return true;

  // Payment-failure pauses created before pauseReason was introduced have no
  // resume date. Customer/admin pauses always have a bounded pausedUntil date.
  return !subscription.pauseReason && !subscription.pausedUntil;
}

function resolveOrderItemsForDelivery(subscription, deliveryDate) {
  const deliveryWeekday = weekdayInTimeZone(
    deliveryDate,
    SUBSCRIPTION_TIME_ZONE,
  );
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
async function HandleSubscriptionInvoicePaidUnlocked(invoice) {
  const stripeSubscriptionId = resolveInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) return; // Not a subscription invoice

  const subscription = await findLocalSubscription(stripeSubscriptionId);

  if (!subscription) {
    throw new Error(
      `Local subscription is not ready for Stripe subscription ${stripeSubscriptionId}`,
    );
  }

  if (!subscription.customer) {
    throw new Error(
      `Subscription ${subscription._id} has no populated customer`,
    );
  }

  const existingInvoiceOrders = await Order.find({
    stripeInvoiceId: invoice.id,
    subscription: subscription._id,
  }).sort({ deliveryDate: 1 });

  const paidAt = invoice.status_transitions?.paid_at
    ? new Date(invoice.status_transitions.paid_at * 1000) : new Date();
  const stripePaymentIntentId = resolveInvoicePaymentIntentId(invoice);
  const plan = await freezeInvoiceFulfillment({ subscriptionId: subscription._id, invoiceId: invoice.id,
    build: async () => {
      const billingWindowStart = existingInvoiceOrders[0]?.deliveryDate
        ? new Date(existingInvoiceOrders[0].deliveryDate)
        : new Date(subscription.nextDeliveryDate || (invoice.period_start || Math.floor(Date.now() / 1000)) * 1000);
      const billingWindowEnd = addBillingWindowDays(billingWindowStart, subscription.frequency, subscription.preferredDeliveryDay);
      if (existingInvoiceOrders.length) {
        // Legacy invoices have no immutable entitlement snapshot. Repair only
        // their known order IDs; do not infer extra days from today's schedule.
        return { paymentIntentId: stripePaymentIntentId, billingWindowStart, billingWindowEnd,
          legacyReviewRequired: true, completedAt: new Date(),
          deliveries: existingInvoiceOrders.map(order => ({ scheduledDate: order.deliveryDate,
            orderId: order._id, amountMinor: order.paymentAllocations?.filter(allocation =>
              allocation.source === "subscription_invoice" && allocation.paymentIntentId === stripePaymentIntentId)
              .reduce((sum, allocation) => sum + Number(allocation.amountMinor || 0), 0) ||
              Math.round(((order.items || []).filter(item => !item.isSubscriptionAddOn)
                .reduce((sum, item) => sum + Number(item.subtotal || 0), 0) + Number(order.deliveryFee || 0)) * 100),
          })) };
      }
      let location = { lat: 0, lng: 0 };
      try { location = await require("../../Integration/google.geocode").geocodeAddress(subscription.deliveryAddress); } catch {}
      const slots = await SubscriptionDelivery.find({ subscription: subscription._id,
        status: { $in: ["scheduled", "generated"] },
        scheduledDate: { $gte: startOfDay(billingWindowStart), $lt: startOfDay(billingWindowEnd) },
      }).sort({ scheduledDate: 1 });
      if (!slots.length) slots.push({ scheduledDate: billingWindowStart });
      const deliveries = [];
      for (const slot of slots) {
        const deliveryDate = new Date(slot.scheduledDate);
        const effectiveFrom = subscription.pendingChanges?.effectiveFrom;
        if (subscription.pendingChanges && (!effectiveFrom || new Date(effectiveFrom) <= deliveryDate)) {
          // Failure must retry before any order is created, not silently use
          // items that differ from the invoice-funded plan.
          await promotePendingChanges(subscription);
        }
        const recurring = resolveOrderItemsForDelivery(subscription, deliveryDate).map(item => ({
          product: item.product, variant: item.variant, name: item.name, sku: item.sku,
          price: item.unitPrice, quantity: item.quantity, subtotal: item.unitPrice * item.quantity,
          isSubscriptionAddOn: false,
        }));
        const addOns = Array.isArray(slot.addOns) ? slot.addOns : [];
        const items = [...recurring, ...addOns.flatMap(addOn => (addOn.items || []).map(item => ({
          product: item.product, variant: item.variant, name: item.name, sku: item.sku,
          price: item.unitPrice, quantity: item.quantity, subtotal: item.subtotal, isSubscriptionAddOn: true,
        })))];
        const amountMinor = Math.round((recurring.reduce((sum, item) => sum + item.subtotal, 0) + SUBSCRIPTION_DELIVERY_FEE) * 100);
        const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
        const total = subtotal + SUBSCRIPTION_DELIVERY_FEE;
        deliveries.push({ scheduledDate: deliveryDate, deliveryId: slot._id || null,
          orderId: new mongoose.Types.ObjectId(), amountMinor, addOns,
          orderParams: { customer: subscription.customer._id, items, deliveryAddress: subscription.deliveryAddress,
            customerInstructions: subscription.deliveryAddress.deliveryInstructions || "", location, deliveryDate,
            deliveryFee: SUBSCRIPTION_DELIVERY_FEE, subtotal, total, amountPaid: total,
            status: "paid", deliveryStatus: "ordered", orderType: "subscription_generated",
            subscription: subscription._id, stripePaymentIntentId, stripeInvoiceId: invoice.id,
            paymentAllocations: [ ...(stripePaymentIntentId ? [{ paymentIntentId: stripePaymentIntentId,
              stripeInvoiceId: invoice.id, source: "subscription_invoice", amountMinor }] : []),
              ...addOns.map(addOn => ({ paymentIntentId: addOn.stripePaymentIntentId,
                source: "delivery_add_on", amountMinor: addOn.amountMinor, idempotencyKey: `delivery-add-on:${addOn.operationId}` })) ],
            paidAt, reservationExpiresAt: new Date(Date.now() + 86400000),
          },
        });
      }
      const fundedMinor = deliveries.reduce((sum, delivery) => sum + delivery.amountMinor, 0);
      if (invoice.amount_paid != null && Number(invoice.amount_paid) !== fundedMinor) {
        throw new Error("The paid invoice does not match the delivery plan. Reconciliation is required before fulfillment.");
      }
      return { paymentIntentId: stripePaymentIntentId, billingWindowStart, billingWindowEnd, deliveries };
    },
  });
  const billingWindowEnd = new Date(plan.billingWindowEnd);
  const deliverySlots = plan.deliveries;

  const createdOrders = [];
  let newlyCreatedOrderCount = 0;
  for (const slot of deliverySlots.sort(
    (a, b) =>
      new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime(),
  )) {
    const deliveryDate = new Date(slot.scheduledDate);

    const existing = await Order.findOne({ _id: slot.orderId,
      stripeInvoiceId: invoice.id, subscription: subscription._id });

    if (existing) {
      const existingSlot = await findDeliverySlot(
        subscription._id,
        existing.deliveryDate,
      );
      if (existingSlot && !existingSlot.order) {
        existingSlot.status = "generated";
        existingSlot.order = existing._id;
        existingSlot.generatedAt = existingSlot.generatedAt || new Date();
        await existingSlot.save();
      }
      const paymentIdentity = {
        order: existing._id,
        subscription: subscription._id,
        providerReference: stripePaymentIntentId || null,
      };
      const orderRefunded = existing.status === "refunded";
      const refundedAt = existing.refund?.refundedAt || null;
      if (orderRefunded) {
        // Recover a crash between marking the order refunded and updating its
        // invoice ledger. A paid-invoice replay must not restore paid status.
        await Payment.updateMany({ ...paymentIdentity, status: "paid" }, {
          $set: { status: "refunded", ...(refundedAt ? { refundedAt } : {}) },
        });
      }
      const hasPayment = await Payment.exists({
        ...paymentIdentity,
        status: { $in: ["paid", "refunded"] },
      });
      if (!hasPayment) {
        const invoiceFundedAmount = slot.amountMinor / 100;
        await saveInvoicePayment(invoice.id, {
          customer: subscription.customer._id,
          order: existing._id,
          subscription: subscription._id,
          amount: invoiceFundedAmount,
          currency: invoice.currency || "gbp",
          status: orderRefunded ? "refunded" : "paid",
          ...(orderRefunded && refundedAt ? { refundedAt } : {}),
          providerReference: stripePaymentIntentId || null,
          paidAt,
        });
      }
      const addOnIntentIds = (slot.addOns || [])
        .map((addOn) => addOn.stripePaymentIntentId)
        .filter(Boolean);
      if (addOnIntentIds.length > 0) {
        await Payment.updateMany(
          {
            subscription: subscription._id,
            providerReference: { $in: addOnIntentIds },
          },
          { $set: { order: existing._id } },
        );
      }
      createdOrders.push(existing);
      continue;
    }

    if (!slot.orderParams) throw new Error("A legacy invoice order is missing. Its original fulfillment must be reconciled.");
    const paidAddOns = slot.addOns || [];
    const subscriptionInvoiceAmountMinor = slot.amountMinor;
    let order;
    try {
      order = await Order.create({ ...slot.orderParams, _id: slot.orderId });
    } catch (error) {
      if (error.code !== 11000) throw error;
      order = await Order.findOne({ _id: slot.orderId, stripeInvoiceId: invoice.id, subscription: subscription._id });
      if (!order) throw error;
      // Continue repairing its slot and ledger even if another worker inserted
      // the order before the response was lost.
    }

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

    await saveInvoicePayment(invoice.id, {
      customer: subscription.customer._id,
      order: order._id,
      subscription: subscription._id,
      amount: subscriptionInvoiceAmountMinor / 100,
      currency: invoice.currency || "gbp",
      status: "paid",
      providerReference: stripePaymentIntentId || null,
      paidAt,
    });

    const addOnIntentIds = paidAddOns
      .map((addOn) => addOn.stripePaymentIntentId)
      .filter(Boolean);
    if (addOnIntentIds.length > 0) {
      await Payment.updateMany(
        {
          subscription: subscription._id,
          providerReference: { $in: addOnIntentIds },
        },
        { $set: { order: order._id } },
      );
    }

    createdOrders.push(order);
    newlyCreatedOrderCount += 1;
  }

  if (!plan.completedAt && (
    !subscription.nextDeliveryDate ||
    new Date(subscription.nextDeliveryDate).getTime() < billingWindowEnd.getTime()
  )) {
    subscription.nextDeliveryDate = billingWindowEnd;
  }

  // A successful retry settles the debt that caused this specific pause. Clear
  // Stripe's future-invoice pause and reactivate locally. Deliberate customer
  // pauses are left untouched even if an outstanding invoice is later paid.
  if (isPaymentFailurePause(subscription) &&
      (!subscription.paymentFailureInvoiceId || subscription.paymentFailureInvoiceId === invoice.id)) {
    if (subscription.stripeSubscriptionId) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        pause_collection: "",
      });
    }
    subscription.status = "active";
    subscription.pausedAt = null;
    subscription.pausedUntil = null;
    subscription.pauseReason = null;
    subscription.paymentFailureInvoiceId = null;
    logger.info(
      `[SubscriptionWebhook] Reactivated subscription ${subscription.subscriptionNumber} after invoice ${invoice.id} recovered`,
    );
  }

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
  if (!plan.completedAt) await InvoiceFulfillment.updateOne({ _id: plan._id }, { $set: { completedAt: new Date() } });

  if (newlyCreatedOrderCount > 0) {
    // Notify once for work actually performed. A duplicate/retried webhook must
    // not create duplicate customer notifications.
    await CustomerNotification.create({
      customer: subscription.customer._id,
      type: "subscription_upcoming_delivery",
      title: "Subscription order confirmed",
      message:
        createdOrders.length > 1
          ? `Your subscription orders have been created for ${createdOrders.length} delivery days in this billing cycle.`
          : `Your subscription order #${createdOrders[0].orderId} has been created for ${createdOrders[0].deliveryDate.toLocaleDateString("en-GB", {
            timeZone: SUBSCRIPTION_TIME_ZONE,
          })}.`,
      relatedOrder: createdOrders[0]?._id,
      relatedSubscription: subscription._id,
    });
  }

  logger.info(
    `[SubscriptionWebhook] Created ${newlyCreatedOrderCount} order(s) from invoice ${invoice.id} (subscription ${subscription.subscriptionNumber})`,
  );
}

/**
 * invoice.payment_failed
 *
 * Stripe couldn't charge the subscription. Pause it immediately and notify the customer.
 */
async function HandleSubscriptionInvoiceFailedUnlocked(eventInvoice) {
  // Event payloads are historical snapshots, including the legacy shape.
  // Fail closed if Stripe is unavailable so it retries instead of applying stale state.
  const invoice = await stripe.invoices.retrieve(eventInvoice.id);
  if (invoice.paid || ["paid", "void", "uncollectible"].includes(invoice.status)) return;
  if (invoice.status !== "open") return;
  const stripeSubscriptionId = resolveInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) return;

  const subscription = await findLocalSubscription(stripeSubscriptionId);
  if (!subscription) {
    throw new Error(
      `Local subscription is not ready for Stripe subscription ${stripeSubscriptionId}`,
    );
  }

  // A recorded paid order also proves this failure event is obsolete. This
  // catches a paid handler winning the race with the Stripe retrieval above.
  if (await Order.exists({ subscription: subscription._id, stripeInvoiceId: invoice.id })) return;
  if (subscription.status !== "active" || subscription.isCancellationScheduled) return;

  // Pause Stripe billing to stop future charges while the customer fixes their payment.
  if (subscription.stripeSubscriptionId && subscription.status === "active") {
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      pause_collection: { behavior: "void" },
    });

    subscription.status = "paused";
    subscription.pausedAt = subscription.pausedAt || new Date();
    subscription.pauseReason = "payment_failed";
    subscription.paymentFailureInvoiceId = invoice.id;
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
async function HandleStripeSubscriptionUpdatedUnlocked(eventSubscription) {
  // Always use the current provider state, never a delayed event snapshot.
  const stripeSub = await stripe.subscriptions.retrieve(eventSubscription.id);
  const subscription = await Subscription.findOne({
    stripeSubscriptionId: stripeSub.id,
  });
  if (!subscription || subscription.status === "cancelled") return;

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
      subscription.pauseReason = subscription.pauseReason || "stripe";
      changed = true;
    }
  } else if (stripeSub.status === "active" || stripeSub.status === "trialing") {
    // Customer pauses belong to the portal; payment-failure pauses belong to
    // the matching paid invoice. Only a Stripe-originated pause is synced here.
    if (subscription.status === "paused" && subscription.pauseReason === "stripe") {
      subscription.status = "active";
      subscription.pausedAt = null;
      subscription.pausedUntil = null;
      subscription.pauseReason = null;
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
async function HandleStripeSubscriptionDeletedUnlocked(stripeSub) {
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

/**
 * Pull-based safety net for recently missed paid-invoice webhooks.
 *
 * We deliberately refuse automatic historical backfills: once a delivery date
 * is old, creating an order can put a customer onto a present-day route for a
 * delivery that should instead be reviewed/refunded. Historical drift is
 * reported by the integrity audit and requires an explicit repair decision.
 */
async function ReconcileRecentPaidSubscriptionInvoices({
  recentWindowMs = 36 * 60 * 60 * 1000,
} = {}) {
  const cutoffSeconds = Math.floor((Date.now() - recentWindowMs) / 1000);
  const subscriptions = await Subscription.find({
    status: "active",
    stripeSubscriptionId: { $type: "string", $ne: "" },
  }).select("_id subscriptionNumber stripeSubscriptionId");

  const result = { checked: 0, reconciled: 0, historicalDrift: 0, failed: 0 };
  for (const subscription of subscriptions) {
    result.checked += 1;
    try {
      const invoicePage = await stripe.invoices.list({
        subscription: subscription.stripeSubscriptionId,
        limit: 100,
      });
      const paidInvoices = (invoicePage.data || [])
        .filter((invoice) => invoice.paid || invoice.status === "paid")
        .sort((left, right) => Number(left.created) - Number(right.created));
      const linkedIds = new Set(
        await Order.distinct("stripeInvoiceId", {
          subscription: subscription._id,
          stripeInvoiceId: { $ne: null },
        }),
      );
      // A linked order does not prove the whole billing window was saved.
      // Replay recent invoices through the per-delivery idempotent handler so
      // missing orders, slot links and payment records can all be repaired.
      const { historical, recent } = selectInvoicesForRecovery(
        paidInvoices, linkedIds, cutoffSeconds,
      );
      if (historical.length > 0) {
        result.historicalDrift += 1;
        logger.error(
          `[SubscriptionReconcile] ${subscription.subscriptionNumber} has historical paid invoices without orders; run the integrity audit before repair`,
        );
      }

      // Historical ambiguity must not disable recovery for a new payment on
      // the same subscription. Quarantine only the old invoices and continue
      // reconciling recent, operationally safe billing events.
      for (const invoice of recent) {
        await HandleSubscriptionInvoicePaid(invoice);
        result.reconciled += 1;
      }
    } catch (err) {
      result.failed += 1;
      logger.error(
        `[SubscriptionReconcile] Failed for ${subscription.subscriptionNumber}: ${err.message}`,
      );
    }
  }

  return result;
}

async function VerifySubscriptionWebhookConfiguration() {
  const requiredEvents = [
    "invoice.payment_succeeded",
    "invoice.payment_failed",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ];
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const enabled = (endpoints.data || []).filter(
    (endpoint) => endpoint.status === "enabled",
  );
  const missingEvents = requiredEvents.filter(
    (eventType) =>
      !enabled.some(
        (endpoint) =>
          endpoint.enabled_events?.includes("*") ||
          endpoint.enabled_events?.includes(eventType),
      ),
  );
  if (missingEvents.length > 0) {
    logger.error(
      `[SubscriptionWebhook] No enabled Stripe endpoint subscribes to: ${missingEvents.join(", ")}`,
    );
  }
  return { ok: missingEvents.length === 0, missingEvents };
}

// Resolve the identity first; all state reads and writes happen after the
// shared lock is held. In particular, failed invoices are re-read inside it.
async function HandleSubscriptionInvoicePaid(eventInvoice) {
  const invoice = await resolveLegacyInvoice(eventInvoice);
  return withSubscriptionLifecycleLock(resolveInvoiceSubscriptionId(invoice),
    () => HandleSubscriptionInvoicePaidUnlocked(invoice), { allowInvoiceRecovery: true });
}
async function HandleSubscriptionInvoiceFailed(eventInvoice) {
  // Most event shapes already identify the subscription. Retrieve here only
  // when needed to locate the lock; the handler verifies current state inside it.
  let stripeSubscriptionId = resolveInvoiceSubscriptionId(eventInvoice);
  if (!stripeSubscriptionId) {
    const invoice = await stripe.invoices.retrieve(eventInvoice.id);
    if (invoice.paid || ["paid", "void", "uncollectible"].includes(invoice.status)) return;
    stripeSubscriptionId = resolveInvoiceSubscriptionId(invoice);
  }
  return withSubscriptionLifecycleLock(stripeSubscriptionId,
    () => HandleSubscriptionInvoiceFailedUnlocked(eventInvoice));
}
async function HandleStripeSubscriptionUpdated(event) {
  return withSubscriptionLifecycleLock(event.id, () => HandleStripeSubscriptionUpdatedUnlocked(event), { ignoreMissing: true });
}
async function HandleStripeSubscriptionDeleted(event) {
  return withSubscriptionLifecycleLock(event.id, () => HandleStripeSubscriptionDeletedUnlocked(event), { ignoreMissing: true });
}

module.exports = {
  resolveInvoiceSubscriptionId,
  resolveInvoicePaymentIntentId,
  HandleSubscriptionInvoicePaid,
  HandleSubscriptionInvoiceFailed,
  HandleStripeSubscriptionUpdated,
  HandleStripeSubscriptionDeleted,
  ReconcileRecentPaidSubscriptionInvoices,
  VerifySubscriptionWebhookConfiguration,
};
