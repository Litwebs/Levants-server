"use strict";

const mongoose = require("mongoose");
const Subscription = require("../../models/subscription.model");
const SubscriptionDelivery = require("../../models/subscriptionDelivery.model");
const ProductVariant = require("../../models/variant.model");
const Customer = require("../../models/customer.model");
const CustomerNotification = require("../../models/customerNotification.model");
const Order = require("../../models/order.model");
const stripe = require("../../utils/stripe.util");
const { Response } = require("../../utils/response.util");
const subscriptionSettingsService = require("../subscriptionSettings.service");
const storeCreditService = require("../storeCredit.service");

const STRIPE_INTERVALS = {
  weekly: { interval: "week", interval_count: 1 },
  every_two_weeks: { interval: "week", interval_count: 2 },
  monthly: { interval: "month", interval_count: 1 },
};

const FREQUENCY_DAYS = {
  weekly: 7,
  every_two_weeks: 14,
  monthly: 30,
};

function calculateSubscriptionTotalMinor(items = []) {
  return items.reduce((sum, item) => {
    const unitPriceMinor = Math.round(Number(item?.unitPrice || 0) * 100);
    const quantity = Math.max(0, Number(item?.quantity || 0));
    return sum + unitPriceMinor * quantity;
  }, 0);
}

/**
 * Returns the effective "now" (in ms) for time-based Stripe parameters.
 *
 * In production this is simply the real time. When the Stripe customer is
 * attached to a (frozen) Test Clock — as happens during local testing — the
 * real server clock can be behind the clock's frozen time, which makes Stripe
 * reject values like `trial_end` for being in the past. In that case we derive
 * "now" from the test clock so the computed dates are valid.
 */
async function getEffectiveNowMs(stripeCustomerId) {
  if (!stripeCustomerId) return Date.now();
  try {
    const stripeCustomer = await stripe.customers.retrieve(stripeCustomerId);
    if (!stripeCustomer || stripeCustomer.deleted) return Date.now();

    const testClockId =
      typeof stripeCustomer.test_clock === "string"
        ? stripeCustomer.test_clock
        : stripeCustomer.test_clock?.id;
    if (!testClockId) return Date.now();

    const clock = await stripe.testHelpers.testClocks.retrieve(testClockId);
    const frozenSeconds = Number(clock?.frozen_time);
    return Number.isFinite(frozenSeconds) && frozenSeconds > 0
      ? frozenSeconds * 1000
      : Date.now();
  } catch {
    return Date.now();
  }
}

async function enrichSubscriptionWithVariantImages(subscriptionLike) {
  if (!subscriptionLike) return subscriptionLike;

  const subscription =
    typeof subscriptionLike.toObject === "function"
      ? subscriptionLike.toObject()
      : { ...subscriptionLike };

  const items = Array.isArray(subscription.items) ? subscription.items : [];
  if (items.length === 0) return subscription;

  const variantIds = items
    .map((item) => String(item?.variant || ""))
    .filter(Boolean);

  if (variantIds.length === 0) return subscription;

  const variants = await ProductVariant.find({ _id: { $in: variantIds } })
    .populate("thumbnailImage", "url")
    .select("thumbnailImage")
    .lean();

  const imageByVariantId = new Map(
    variants.map((variant) => [
      String(variant._id),
      variant.thumbnailImage?.url || null,
    ]),
  );

  subscription.items = items.map((item) => ({
    ...item,
    imageUrl: imageByVariantId.get(String(item?.variant || "")) || null,
  }));

  return subscription;
}

/**
 * Calculate the next delivery date given a preferred day and frequency.
 * @param {number} preferredDay - 0-6 (Sun-Sat)
 * @param {string} frequency
 * @param {Date} [from] - reference date, defaults to now
 */
function calculateNextDeliveryDate(preferredDay, frequency, from = new Date()) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);

  const currentDay = start.getDay();
  let daysUntilPreferred = (preferredDay - currentDay + 7) % 7;

  // For the FIRST scheduled delivery, use the next weekday occurrence.
  // Frequency controls the cadence AFTER that first delivery; it should not
  // cause a brand-new fortnightly subscription created today to skip two weeks.
  if (daysUntilPreferred === 0) {
    daysUntilPreferred = 7;
  }

  const next = new Date(start);
  next.setDate(start.getDate() + daysUntilPreferred);
  return next;
}

function addFrequencyDays(date, frequency) {
  const d = new Date(date);
  d.setDate(d.getDate() + (FREQUENCY_DAYS[frequency] || 7));
  return d;
}

/**
 * Pre-generate upcoming SubscriptionDelivery slots (3 upcoming).
 */
async function scheduleUpcomingDeliveries(subscription, session) {
  const slots = [];
  let nextDate = new Date(subscription.nextDeliveryDate);

  for (let i = 0; i < 3; i++) {
    // Check if a slot for this date already exists
    const exists = await SubscriptionDelivery.findOne({
      subscription: subscription._id,
      scheduledDate: nextDate,
    }).session(session || null);

    if (!exists) {
      slots.push({
        subscription: subscription._id,
        customer: subscription.customer,
        scheduledDate: new Date(nextDate),
        status: "scheduled",
      });
    }
    nextDate = addFrequencyDays(nextDate, subscription.frequency);
  }

  if (slots.length > 0) {
    await SubscriptionDelivery.insertMany(slots, { session: session || null });
  }
}

/**
 * Recalculate the subscription total and update the Stripe subscription price.
 * Called after any item add/update/remove so Stripe charges the correct amount.
 */
async function syncStripeSubscriptionPrice(subscription, itemsOverride) {
  if (!subscription.stripeSubscriptionId || !subscription.stripeProductId)
    return;

  const items =
    Array.isArray(itemsOverride) && itemsOverride.length > 0
      ? itemsOverride
      : subscription.items;
  const newTotalMinor = calculateSubscriptionTotalMinor(items);

  const { interval, interval_count } = STRIPE_INTERVALS[subscription.frequency];

  try {
    const newPrice = await stripe.prices.create({
      product: subscription.stripeProductId,
      currency: "gbp",
      unit_amount: newTotalMinor,
      recurring: { interval, interval_count },
    });

    const stripeSub = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId,
    );
    const existingItemId = stripeSub.items?.data?.[0]?.id;
    const oldPriceId = subscription.stripePriceId;

    if (existingItemId) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        items: [{ id: existingItemId, price: newPrice.id }],
        proration_behavior: "none",
      });
    }

    // Archive old price to keep Stripe dashboard tidy
    if (oldPriceId && oldPriceId !== newPrice.id) {
      try {
        await stripe.prices.update(oldPriceId, { active: false });
      } catch {
        // Non-fatal
      }
    }

    subscription.stripePriceId = newPrice.id;
    await subscription.save();
  } catch (err) {
    console.error("[syncStripeSubscriptionPrice] Failed:", err.message);
    // Non-fatal — our DB is correct, Stripe may be out of sync
  }
}

// ── Cut-off helpers ─────────────────────────────────────────────────────────

function parseCutoffTime(timeStr) {
  const [h, m] = String(timeStr || "22:00")
    .split(":")
    .map((n) => Number(n));
  return { h: Number.isFinite(h) ? h : 22, m: Number.isFinite(m) ? m : 0 };
}

/**
 * The modification cut-off for a given delivery date:
 * deliveryDate − cutoffDaysBefore days, at cutoffTime.
 */
function computeCutoffDate(nextDeliveryDate, settings) {
  if (!nextDeliveryDate) return null;
  const cutoff = new Date(nextDeliveryDate);
  cutoff.setDate(cutoff.getDate() - (Number(settings?.cutoffDaysBefore) || 0));
  const { h, m } = parseCutoffTime(settings?.cutoffTime);
  cutoff.setHours(h, m, 0, 0);
  return cutoff;
}

async function getCutoffStatus(subscription) {
  const settings = await subscriptionSettingsService.getOrCreateSettings();
  const cutoffAt = computeCutoffDate(subscription.nextDeliveryDate, settings);
  const isPastCutoff = cutoffAt ? Date.now() >= cutoffAt.getTime() : false;
  return { settings, cutoffAt, isPastCutoff };
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateLabel(value) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function parsePauseResumeDate(resumeOn) {
  if (!resumeOn) {
    return {
      ok: false,
      message: "Please choose when the subscription should resume.",
    };
  }

  const requested = startOfDay(resumeOn);
  if (Number.isNaN(requested.getTime())) {
    return { ok: false, message: "Please choose a valid resume date." };
  }

  const today = startOfDay(new Date());
  const minResume = new Date(today);
  minResume.setDate(minResume.getDate() + 1);

  const maxResume = new Date(today);
  maxResume.setDate(maxResume.getDate() + 28);

  if (requested < minResume) {
    return {
      ok: false,
      message: "Resume date must be at least tomorrow.",
    };
  }

  if (requested > maxResume) {
    return {
      ok: false,
      message: "A subscription can only be paused for up to 28 days.",
    };
  }

  return { ok: true, resumeDate: requested };
}

async function getResumeNextDeliveryDate(
  subscription,
  referenceDate = new Date(),
) {
  const retainedDelivery = await SubscriptionDelivery.findOne({
    subscription: subscription._id,
    status: "scheduled",
    scheduledDate: { $gte: startOfDay(referenceDate) },
  })
    .sort({ scheduledDate: 1 })
    .lean();

  return retainedDelivery?.scheduledDate
    ? new Date(retainedDelivery.scheduledDate)
    : calculateNextDeliveryDate(
        subscription.preferredDeliveryDay,
        subscription.frequency,
        referenceDate,
      );
}

async function activatePausedSubscription(
  subscription,
  {
    notificationType = "subscription_resumed",
    notificationTitle = "Subscription resumed",
    notificationMessage,
  } = {},
) {
  if (subscription.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        pause_collection: "",
      });
    } catch (err) {
      console.error("[ResumeSubscription] Stripe resume failed:", err.message);
    }
  }

  subscription.status = "active";
  subscription.pausedAt = null;
  subscription.pausedUntil = null;
  subscription.nextDeliveryDate = await getResumeNextDeliveryDate(subscription);
  await subscription.save();

  await scheduleUpcomingDeliveries(subscription);

  await CustomerNotification.create({
    customer: subscription.customer,
    type: notificationType,
    title: notificationTitle,
    message:
      notificationMessage ||
      `Your subscription is active again. Next delivery: ${formatDateLabel(subscription.nextDeliveryDate)}.`,
    relatedSubscription: subscription._id,
  });

  return subscription;
}

async function AutoResumePausedSubscriptions({
  subscriptionId,
  customerId,
} = {}) {
  const filter = {
    status: "paused",
    pausedUntil: { $ne: null, $lte: new Date() },
  };

  if (subscriptionId) filter._id = subscriptionId;
  if (customerId) filter.customer = customerId;

  const pausedSubscriptions = await Subscription.find(filter);
  let resumed = 0;

  for (const subscription of pausedSubscriptions) {
    await activatePausedSubscription(subscription, {
      notificationType: "subscription_auto_resumed",
      notificationTitle: "Subscription resumed automatically",
      notificationMessage:
        "Your pause period has ended, so your subscription has resumed automatically.",
    });
    resumed += 1;
  }

  return resumed;
}

function itemsToPlain(items = []) {
  return items.map((i) => ({
    // Preserve existing subdocument _id so item identity is stable across
    // modifications. Mongoose generates a new _id when the field is absent;
    // preserving it prevents stale-id lookups after a save.
    ...(i._id ? { _id: i._id } : {}),
    product: i.product,
    variant: i.variant,
    name: i.name,
    sku: i.sku,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
  }));
}

/**
 * Charge a one-off amount immediately against the customer's default card.
 * Used when an increase is made before the cut-off so the extra is collected now.
 */
async function chargeDeltaNow(
  subscription,
  customer,
  amountMinor,
  description,
) {
  if (!amountMinor || amountMinor <= 0)
    return { ok: true, paymentIntent: null };
  if (!customer?.stripeCustomerId) {
    return { ok: false, message: "No payment method on file" };
  }

  let stripeCustomer;
  try {
    stripeCustomer = await stripe.customers.retrieve(customer.stripeCustomerId);
  } catch {
    return { ok: false, message: "Could not verify your payment profile" };
  }

  const pmId = stripeCustomer?.invoice_settings?.default_payment_method;
  if (!pmId) {
    return { ok: false, message: "Please add a default card first" };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountMinor,
      currency: "gbp",
      customer: customer.stripeCustomerId,
      payment_method: pmId,
      off_session: true,
      confirm: true,
      description,
      metadata: {
        subscriptionId: String(subscription._id),
        subscriptionNumber: subscription.subscriptionNumber,
        type: "subscription_modification",
      },
    });
    return { ok: true, paymentIntent };
  } catch (err) {
    return {
      ok: false,
      message:
        err?.message || "We couldn't charge your card for the extra items",
    };
  }
}

/**
 * Attempt to refund `amountMinor` to the customer's card by refunding the most
 * recent paid order generated by this subscription. Returns the amount actually
 * refunded to the card (minor units). Any shortfall is the caller's
 * responsibility to handle (e.g. fall back to store credit).
 */
async function refundSubscriptionToCard(subscription, amountMinor) {
  if (!amountMinor || amountMinor <= 0) {
    return { refundedMinor: 0, stripeRefundId: null };
  }

  const lastPaidOrder = await Order.findOne({
    subscription: subscription._id,
    status: { $in: ["paid", "partially_refunded"] },
    stripePaymentIntentId: { $ne: null },
  })
    .sort({ paidAt: -1, createdAt: -1 })
    .select("stripePaymentIntentId")
    .lean();

  if (!lastPaidOrder?.stripePaymentIntentId) {
    return { refundedMinor: 0, stripeRefundId: null, noOrder: true };
  }

  try {
    const refund = await stripe.refunds.create({
      payment_intent: lastPaidOrder.stripePaymentIntentId,
      amount: amountMinor,
      metadata: {
        subscriptionId: String(subscription._id),
        subscriptionNumber: subscription.subscriptionNumber,
        type: "subscription_decrease_refund",
      },
    });
    return { refundedMinor: amountMinor, stripeRefundId: refund.id };
  } catch (err) {
    // Couldn't refund to card (no refundable balance, etc.) — caller falls back.
    return { refundedMinor: 0, stripeRefundId: null, error: err };
  }
}

/**
 * Reflect a pre-cut-off item change on the already-created, upcoming (paid,
 * not-yet-dispatched) subscription order, so the box that ships matches what the
 * customer now pays. Rebuilds the item snapshot, recomputes totals and adjusts
 * the recorded amountPaid by the settled card delta. Returns true if an order
 * was updated.
 */
async function updateUpcomingSubscriptionOrder(
  subscription,
  nextItems,
  { chargedMinor = 0, refundedMinor = 0 } = {},
) {
  const order = await Order.findOne({
    subscription: subscription._id,
    status: { $in: ["paid", "partially_refunded"] },
    deliveryStatus: "ordered",
  })
    .sort({ deliveryDate: -1, createdAt: -1 })
    .exec();

  if (!order) return false;

  order.items = nextItems.map((item) => ({
    product: item.product,
    variant: item.variant,
    name: item.name,
    sku: item.sku,
    price: item.unitPrice,
    quantity: item.quantity,
    subtotal: item.unitPrice * item.quantity,
  }));

  const newTotal = order.items.reduce((sum, i) => sum + i.subtotal, 0);
  order.subtotal = newTotal;
  order.total = newTotal + (order.deliveryFee || 0);

  // Money on the order is in pounds; settlement deltas are in pence.
  const deltaPounds = (chargedMinor - refundedMinor) / 100;
  order.amountPaid = Math.max(0, (order.amountPaid || 0) + deltaPounds);

  if (refundedMinor > 0) {
    order.status = "partially_refunded";
  }

  await order.save();
  return true;
}

/**
 * Apply a proposed new item list to a subscription, honouring the cut-off:
 *  - Before cut-off: changes affect the upcoming delivery. Increases are
 *    charged immediately and the recurring Stripe price is synced right away so
 *    future invoices use the new amount. Decreases settle the difference back
 *    to the customer immediately (store credit or refund to card) and the
 *    downward price sync is deferred.
 *  - After cut-off: changes are staged in `pendingChanges` and take effect
 *    from the following delivery.
 */
async function applyItemChange(
  subscription,
  customer,
  nextItems,
  actionLabel,
  refundMethod = "credit",
) {
  const { isPastCutoff } = await getCutoffStatus(subscription);

  if (isPastCutoff) {
    const effectiveFrom = subscription.nextDeliveryDate
      ? addFrequencyDays(subscription.nextDeliveryDate, subscription.frequency)
      : null;
    subscription.pendingChanges = {
      ...(subscription.pendingChanges
        ? subscription.pendingChanges.toObject?.() ||
          subscription.pendingChanges
        : {}),
      items: nextItems,
      effectiveFrom,
    };
    await subscription.save();
    // The post-cut-off change takes effect from the next billable delivery,
    // whose invoice has NOT been generated yet (the cut-off sits before the
    // invoice date). Update the recurring Stripe price now — with proration
    // disabled — so that delivery's invoice charges the new amount. The already
    // paid current delivery is unaffected. Items stay staged in pendingChanges
    // and are promoted when that delivery's invoice is paid.
    await syncStripeSubscriptionPrice(subscription, nextItems);
    const enriched = await enrichSubscriptionWithVariantImages(subscription);
    return Response(
      true,
      effectiveFrom
        ? `Cut-off has passed for your next delivery. This change will apply from ${effectiveFrom.toLocaleDateString(
            "en-GB",
          )}.`
        : "Saved. This change will apply from your next delivery.",
      { subscription: enriched, appliedTo: "next" },
    );
  }

  // Before cut-off → affects the upcoming delivery.
  const oldMinor = calculateSubscriptionTotalMinor(subscription.items);
  const newMinor = calculateSubscriptionTotalMinor(nextItems);
  const deltaMinor = newMinor - oldMinor;

  if (deltaMinor > 0) {
    const charge = await chargeDeltaNow(
      subscription,
      customer,
      deltaMinor,
      `${actionLabel} – ${subscription.subscriptionNumber}`,
    );
    if (!charge.ok) {
      return Response(false, charge.message, null);
    }
    subscription.items = nextItems;
    await subscription.save();
    await syncStripeSubscriptionPrice(subscription);
    await updateUpcomingSubscriptionOrder(subscription, nextItems, {
      chargedMinor: deltaMinor,
    });
    const enriched = await enrichSubscriptionWithVariantImages(subscription);
    return Response(
      true,
      `You've been charged ${formatMinor(deltaMinor)} for the added items on your upcoming delivery, and future invoices have been updated.`,
      {
        subscription: enriched,
        appliedTo: "upcoming",
        chargedMinor: deltaMinor,
      },
    );
  }

  // Decrease → refund the difference to the customer now (their upcoming
  // delivery is already paid), correct the upcoming order, and sync the price
  // down immediately so future invoices bill the new amount.
  if (deltaMinor < 0) {
    const owedMinor = Math.abs(deltaMinor);

    // If the customer explicitly chose card refund, verify there is a paid order
    // with a captured payment intent BEFORE we commit any changes. Failing early
    // avoids the subscription being modified without any money being returned.
    if (refundMethod === "refund") {
      const hasPaidOrder = await Order.exists({
        subscription: subscription._id,
        status: { $in: ["paid", "partially_refunded"] },
        stripePaymentIntentId: { $ne: null },
      });
      if (!hasPaidOrder) {
        return Response(
          false,
          "We couldn't find a captured payment to refund to your card. Please choose store credit instead.",
          null,
        );
      }
    }

    subscription.items = nextItems;
    await subscription.save();
    await syncStripeSubscriptionPrice(subscription);

    let creditedMinor = 0;
    let refundedMinor = 0;
    let stripeRefundId = null;

    if (refundMethod === "refund") {
      const refundResult = await refundSubscriptionToCard(
        subscription,
        owedMinor,
      );
      refundedMinor = refundResult.refundedMinor;
      stripeRefundId = refundResult.stripeRefundId;
    }

    // Whatever couldn't be refunded to the card (or all of it, when the
    // customer chose store credit) is granted as store credit.
    const remainderMinor = owedMinor - refundedMinor;
    if (remainderMinor > 0) {
      const creditResult = await storeCreditService.addCredit({
        customerId: customer._id,
        amountMinor: remainderMinor,
        type: "subscription_refund",
        reason: `Refund for reducing ${subscription.subscriptionNumber}`,
        subscriptionId: subscription._id,
      });
      if (creditResult.ok) creditedMinor = remainderMinor;
    }

    await updateUpcomingSubscriptionOrder(subscription, nextItems, {
      refundedMinor,
    });

    const enriched = await enrichSubscriptionWithVariantImages(subscription);

    let message;
    if (refundedMinor > 0 && creditedMinor > 0) {
      message = `We've refunded ${formatMinor(refundedMinor)} to your card and added ${formatMinor(creditedMinor)} as store credit.`;
    } else if (refundedMinor > 0) {
      message = `We've refunded ${formatMinor(refundedMinor)} to your card.`;
    } else {
      message = `We've added ${formatMinor(creditedMinor)} of store credit to your account.`;
    }

    return Response(true, message, {
      subscription: enriched,
      appliedTo: "upcoming",
      refundedMinor,
      creditedMinor,
      stripeRefundId,
    });
  }

  // No change → apply now and reflect on the upcoming invoice.
  subscription.items = nextItems;
  await subscription.save();
  await syncStripeSubscriptionPrice(subscription);
  const enriched = await enrichSubscriptionWithVariantImages(subscription);
  return Response(true, "Your subscription has been updated.", {
    subscription: enriched,
    appliedTo: "upcoming",
  });
}

function formatMinor(minor) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format((Number(minor) || 0) / 100);
}

/**
 * Promote any staged pendingChanges onto the live subscription. Called from the
 * webhook once the upcoming delivery's invoice is paid, so post-cut-off edits
 * take effect from the following delivery.
 */
async function promotePendingChanges(subscription) {
  if (!subscription.pendingChanges) return false;
  const pending = subscription.pendingChanges.toObject
    ? subscription.pendingChanges.toObject()
    : subscription.pendingChanges;

  let changed = false;
  if (Array.isArray(pending.items) && pending.items.length > 0) {
    subscription.items = pending.items;
    changed = true;
  }
  if (pending.deliveryAddress && pending.deliveryAddress.line1) {
    subscription.deliveryAddress = pending.deliveryAddress;
    changed = true;
  }
  if (pending.frequency) {
    subscription.frequency = pending.frequency;
    changed = true;
  }
  if (
    pending.preferredDeliveryDay !== undefined &&
    pending.preferredDeliveryDay !== null
  ) {
    subscription.preferredDeliveryDay = pending.preferredDeliveryDay;
    changed = true;
  }

  subscription.pendingChanges = null;
  if (changed) {
    await subscription.save();
    await syncStripeSubscriptionPrice(subscription);
  }
  return changed;
}

/**
 * Create a new subscription and a corresponding Stripe Subscription.
 * Stripe is the billing engine — it will charge the customer's saved card
 * on each billing cycle and fire invoice.payment_succeeded, which we use
 * to create the fulfillment Order in our DB.
 */
async function CreateSubscription({
  customerId,
  frequency,
  preferredDeliveryDay,
  deliveryAddressId,
  notes,
  items,
} = {}) {
  const customer = await Customer.findById(customerId);
  if (!customer) return Response(false, "Customer not found", null);
  const customerDisplayName =
    [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() ||
    customer.email ||
    "Customer";

  // Delivery day must be one the business actually delivers on.
  const settings = await subscriptionSettingsService.getOrCreateSettings();
  if (!settings.deliveryDays.includes(Number(preferredDeliveryDay))) {
    return Response(
      false,
      "Selected delivery day is not available. Please choose an available day.",
      null,
    );
  }

  // Require a Stripe customer with a saved default payment method
  if (!customer.stripeCustomerId) {
    return Response(
      false,
      "Please add a payment method before creating a subscription",
      null,
    );
  }

  let stripeCustomer;
  try {
    stripeCustomer = await stripe.customers.retrieve(customer.stripeCustomerId);
  } catch {
    return Response(false, "Could not verify your payment profile", null);
  }

  const defaultPmId = stripeCustomer?.invoice_settings?.default_payment_method;
  if (!defaultPmId) {
    return Response(
      false,
      "Please add a default card before creating a subscription",
      null,
    );
  }

  const address = customer.addresses.id(deliveryAddressId);
  if (!address) return Response(false, "Delivery address not found", null);

  // Resolve variants
  const variantIds = items.map((i) => new mongoose.Types.ObjectId(i.variantId));
  const variants = await ProductVariant.find({
    _id: { $in: variantIds },
    status: "active",
  }).populate("product", "name status isSubscriptionEligible");

  if (variants.length !== items.length) {
    return Response(false, "One or more products are unavailable", null);
  }

  for (const v of variants) {
    if (!v.product || v.product.status !== "active") {
      return Response(false, `Product "${v.name}" is not available`, null);
    }
    if (!v.product.isSubscriptionEligible) {
      return Response(
        false,
        `"${v.product.name}" is not eligible for subscriptions`,
        null,
      );
    }
  }

  const variantMap = new Map(variants.map((v) => [String(v._id), v]));
  const subscriptionItems = items.map((item) => {
    const variant = variantMap.get(String(item.variantId));
    return {
      product: variant.product._id,
      variant: variant._id,
      name: `${variant.product.name} – ${variant.name}`,
      sku: variant.sku,
      quantity: item.quantity,
      unitPrice: variant.price,
    };
  });

  const effectiveNowMs = await getEffectiveNowMs(customer.stripeCustomerId);

  const nextDeliveryDate = calculateNextDeliveryDate(
    preferredDeliveryDay,
    frequency,
    new Date(effectiveNowMs),
  );
  const startDate = new Date(effectiveNowMs);

  const totalMinor = calculateSubscriptionTotalMinor(subscriptionItems);

  // ── Create Stripe Product + Price + Subscription ──────────────────────────
  const { interval, interval_count } = STRIPE_INTERVALS[frequency];

  const stripeProduct = await stripe.products.create({
    name: `Levants Subscription – ${customerDisplayName}`.slice(0, 250),
    metadata: { customerId: String(customer._id) },
  });

  const stripePrice = await stripe.prices.create({
    product: stripeProduct.id,
    currency: "gbp",
    unit_amount: totalMinor,
    recurring: { interval, interval_count },
  });

  // Charge immediately at subscribe. The first invoice is paid now and
  // pre-pays the upcoming delivery, so a real payment exists to refund against
  // if the customer reduces the order before the cut-off. `error_if_incomplete`
  // ensures we don't create a subscription unless that first payment succeeds.
  let stripeSub;
  try {
    stripeSub = await stripe.subscriptions.create({
      customer: customer.stripeCustomerId,
      items: [{ price: stripePrice.id }],
      default_payment_method: defaultPmId,
      payment_behavior: "error_if_incomplete",
      metadata: {
        customerId: String(customer._id),
      },
    });
  } catch (err) {
    // Tidy up the Stripe price we created for this failed attempt.
    try {
      await stripe.prices.update(stripePrice.id, { active: false });
    } catch {
      // Non-fatal
    }
    return Response(
      false,
      err?.message || "We couldn't take payment for your subscription",
      null,
    );
  }

  const subscription = await Subscription.create({
    customer: customer._id,
    frequency,
    preferredDeliveryDay,
    nextDeliveryDate,
    startDate,
    deliveryAddress: {
      line1: address.line1,
      line2: address.line2 || null,
      city: address.city,
      postcode: address.postcode,
      country: address.country,
      deliveryInstructions: address.deliveryInstructions || null,
    },
    items: subscriptionItems,
    notes: notes || null,
    status: "active",
    stripeSubscriptionId: stripeSub.id,
    stripeProductId: stripeProduct.id,
    stripePriceId: stripePrice.id,
  });

  // Back-fill metadata with our local subscription ID
  await stripe.subscriptions.update(stripeSub.id, {
    metadata: {
      customerId: String(customer._id),
      subscriptionId: String(subscription._id),
      subscriptionNumber: subscription.subscriptionNumber,
    },
  });

  await scheduleUpcomingDeliveries(subscription);

  await CustomerNotification.create({
    customer: customer._id,
    type: "subscription_created",
    title: "Subscription created",
    message: `Your ${frequency.replace("_", " ")} subscription has been set up. First delivery: ${nextDeliveryDate.toLocaleDateString("en-GB")}.`,
    relatedSubscription: subscription._id,
  });

  const enriched = await enrichSubscriptionWithVariantImages(subscription);
  return Response(true, "Subscription created", { subscription: enriched });
}
/**
 * List subscriptions for a customer.
 */
async function ListSubscriptions({
  customerId,
  status,
  page = 1,
  pageSize = 20,
} = {}) {
  await AutoResumePausedSubscriptions({ customerId });

  const filter = { customer: customerId };
  if (status) filter.status = status;

  const total = await Subscription.countDocuments(filter);
  const subscriptions = await Subscription.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  return Response(true, null, {
    subscriptions,
    meta: { page, pageSize, total },
  });
}

/**
 * Get single subscription.
 */
async function GetSubscription({ customerId, subscriptionId } = {}) {
  await AutoResumePausedSubscriptions({ customerId, subscriptionId });

  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  }).lean();
  if (!subscription) return Response(false, "Subscription not found", null);
  const enriched = await enrichSubscriptionWithVariantImages(subscription);

  const settings = await subscriptionSettingsService.getOrCreateSettings();
  const cutoffAt = computeCutoffDate(enriched.nextDeliveryDate, settings);
  const isPastCutoff = cutoffAt ? Date.now() >= cutoffAt.getTime() : false;

  return Response(true, null, {
    subscription: enriched,
    cutoff: {
      cutoffAt,
      isPastCutoff,
      cutoffDaysBefore: settings.cutoffDaysBefore,
      cutoffTime: settings.cutoffTime,
      deliveryDays: settings.deliveryDays,
    },
  });
}

/**
 * Update subscription settings (frequency, delivery day, address, notes).
 */
async function UpdateSubscription({
  customerId,
  subscriptionId,
  frequency,
  preferredDeliveryDay,
  deliveryAddressId,
  notes,
} = {}) {
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  });
  if (!subscription) return Response(false, "Subscription not found", null);

  if (subscription.status !== "active") {
    return Response(
      false,
      "Paused or cancelled subscriptions cannot be changed.",
      null,
    );
  }

  const settings = await subscriptionSettingsService.getOrCreateSettings();
  if (
    preferredDeliveryDay !== undefined &&
    !settings.deliveryDays.includes(Number(preferredDeliveryDay))
  ) {
    return Response(
      false,
      "Selected delivery day is not available. Please choose an available day.",
      null,
    );
  }

  const { isPastCutoff } = await getCutoffStatus(subscription);

  if (frequency !== undefined) subscription.frequency = frequency;
  if (preferredDeliveryDay !== undefined)
    subscription.preferredDeliveryDay = preferredDeliveryDay;
  if (notes !== undefined) subscription.notes = notes || null;

  if (deliveryAddressId !== undefined) {
    const customer = await Customer.findById(customerId);
    const address = customer && customer.addresses.id(deliveryAddressId);
    if (!address) return Response(false, "Address not found", null);
    const newAddress = {
      line1: address.line1,
      line2: address.line2 || null,
      city: address.city,
      postcode: address.postcode,
      country: address.country,
      deliveryInstructions: address.deliveryInstructions || null,
    };

    if (isPastCutoff) {
      // Cut-off passed for the upcoming delivery → apply from the next one.
      subscription.pendingChanges = {
        ...(subscription.pendingChanges
          ? subscription.pendingChanges.toObject?.() ||
            subscription.pendingChanges
          : {}),
        deliveryAddress: newAddress,
        effectiveFrom: subscription.nextDeliveryDate
          ? addFrequencyDays(
              subscription.nextDeliveryDate,
              subscription.frequency,
            )
          : null,
      };
    } else {
      subscription.deliveryAddress = newAddress;
    }
  }

  // Recalculate next delivery date if frequency or day changed
  if (frequency !== undefined || preferredDeliveryDay !== undefined) {
    subscription.nextDeliveryDate = calculateNextDeliveryDate(
      subscription.preferredDeliveryDay,
      subscription.frequency,
    );
    // Generate new upcoming delivery slots
    await scheduleUpcomingDeliveries(subscription);
  }

  await subscription.save();

  await CustomerNotification.create({
    customer: customerId,
    type: "subscription_updated",
    title: "Subscription updated",
    message: "Your subscription has been updated.",
    relatedSubscription: subscription._id,
  });

  const enriched = await enrichSubscriptionWithVariantImages(subscription);
  return Response(true, "Subscription updated", { subscription: enriched });
}

/**
 * Pause a subscription.
 */
async function PauseSubscription({
  customerId,
  subscriptionId,
  resumeOn,
} = {}) {
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  });
  if (!subscription) return Response(false, "Subscription not found", null);
  if (subscription.status !== "active") {
    return Response(false, "Only active subscriptions can be paused", null);
  }

  const pauseResume = parsePauseResumeDate(resumeOn);
  if (!pauseResume.ok) {
    return Response(false, pauseResume.message, null);
  }

  // Pause billing in Stripe (void invoices while paused)
  if (subscription.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        pause_collection: { behavior: "void" },
      });
    } catch (err) {
      // Non-fatal: log and continue so our DB stays accurate
      console.error("[PauseSubscription] Stripe pause failed:", err.message);
    }
  }

  subscription.status = "paused";
  subscription.pausedAt = new Date();
  subscription.pausedUntil = pauseResume.resumeDate;
  await subscription.save();

  // Keep the already-billed upcoming delivery (nextDeliveryDate) and stop
  // only future scheduled deliveries while paused.
  const pauseDeliveryFilter = subscription.nextDeliveryDate
    ? {
        subscription: subscription._id,
        status: "scheduled",
        scheduledDate: { $gt: new Date(subscription.nextDeliveryDate) },
      }
    : { subscription: subscription._id, status: "scheduled" };

  await SubscriptionDelivery.updateMany(pauseDeliveryFilter, {
    $set: { status: "cancelled" },
  });

  await CustomerNotification.create({
    customer: customerId,
    type: "subscription_paused",
    title: "Subscription paused",
    message: `Your subscription has been paused until ${formatDateLabel(
      pauseResume.resumeDate,
    )}. Any already-billed upcoming delivery remains scheduled, and no changes can be made while paused.`,
    relatedSubscription: subscription._id,
  });

  const enriched = await enrichSubscriptionWithVariantImages(subscription);
  return Response(
    true,
    `Subscription paused until ${formatDateLabel(pauseResume.resumeDate)}.`,
    { subscription: enriched },
  );
}

/**
 * Resume a paused subscription.
 */
async function ResumeSubscription({ customerId, subscriptionId } = {}) {
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  });
  if (!subscription) return Response(false, "Subscription not found", null);
  if (subscription.status !== "paused") {
    return Response(false, "Only paused subscriptions can be resumed", null);
  }

  await activatePausedSubscription(subscription);

  const enriched = await enrichSubscriptionWithVariantImages(subscription);
  return Response(true, "Subscription resumed", { subscription: enriched });
}

/**
 * Cancel a subscription.
 */
async function CancelSubscription({ customerId, subscriptionId, reason } = {}) {
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  });
  if (!subscription) return Response(false, "Subscription not found", null);
  if (subscription.status === "cancelled") {
    return Response(false, "Subscription is already cancelled", null);
  }

  const { isPastCutoff } = await getCutoffStatus(subscription);
  let refundedMinor = 0;
  let stripeRefundId = null;

  // Before cut-off, the upcoming delivery is still changeable and should be
  // refunded immediately when the customer cancels.
  if (!isPastCutoff) {
    const refundableOrder = await Order.findOne({
      subscription: subscription._id,
      status: { $in: ["paid", "partially_refunded"] },
      deliveryStatus: "ordered",
      stripePaymentIntentId: { $ne: null },
    })
      .sort({ deliveryDate: 1, createdAt: 1 })
      .exec();

    if (!refundableOrder?.stripePaymentIntentId) {
      return Response(
        false,
        "We couldn't find a paid upcoming delivery to refund. Please contact support.",
        null,
      );
    }

    const amountPaid = Number(
      refundableOrder.amountPaid ?? refundableOrder.total ?? 0,
    );
    const refundAmountMinor = Math.max(0, Math.round(amountPaid * 100));

    if (refundAmountMinor <= 0) {
      return Response(
        false,
        "No refundable amount was found for the upcoming delivery.",
        null,
      );
    }

    try {
      const refund = await stripe.refunds.create({
        payment_intent: refundableOrder.stripePaymentIntentId,
        amount: refundAmountMinor,
        metadata: {
          subscriptionId: String(subscription._id),
          subscriptionNumber: subscription.subscriptionNumber,
          type: "subscription_cancel_refund",
        },
      });

      refundedMinor = refundAmountMinor;
      stripeRefundId = refund.id;

      refundableOrder.status = "refunded";
      refundableOrder.refund = {
        ...(refundableOrder.refund || {}),
        refundedAt: new Date(),
        reason: reason || "Subscription cancelled before cut-off",
        stripeRefundId: refund.id,
      };
      await refundableOrder.save();
    } catch (err) {
      return Response(
        false,
        err?.message || "We couldn't refund your upcoming delivery payment.",
        null,
      );
    }
  }

  // Cancel the Stripe Subscription so no further charges occur
  if (subscription.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    } catch (err) {
      // If already cancelled in Stripe, that's fine
      if (!err?.message?.includes("No such subscription")) {
        console.error(
          "[CancelSubscription] Stripe cancel failed:",
          err.message,
        );
      }
    }
  }

  subscription.status = "cancelled";
  subscription.cancelledAt = new Date();
  subscription.cancelReason = reason || null;
  subscription.isCancellationScheduled = Boolean(
    isPastCutoff && subscription.nextDeliveryDate,
  );
  subscription.cancellationEffectiveAfter =
    isPastCutoff && subscription.nextDeliveryDate
      ? new Date(subscription.nextDeliveryDate)
      : null;
  await subscription.save();

  // Before cut-off: cancel all scheduled deliveries.
  // After cut-off: keep the already-committed upcoming delivery and cancel only later ones.
  const deliveryCancelFilter =
    isPastCutoff && subscription.nextDeliveryDate
      ? {
          subscription: subscription._id,
          status: "scheduled",
          scheduledDate: { $gt: new Date(subscription.nextDeliveryDate) },
        }
      : { subscription: subscription._id, status: "scheduled" };

  await SubscriptionDelivery.updateMany(deliveryCancelFilter, {
    $set: { status: "cancelled" },
  });

  await CustomerNotification.create({
    customer: customerId,
    type: "subscription_cancelled",
    title: "Subscription cancelled",
    message: isPastCutoff
      ? "Your subscription is scheduled for cancellation. Your next scheduled delivery will still arrive, and all future deliveries have been stopped."
      : "Your subscription has been cancelled and your upcoming delivery has been refunded.",
    relatedSubscription: subscription._id,
  });

  const enriched = await enrichSubscriptionWithVariantImages(subscription);
  return Response(
    true,
    isPastCutoff
      ? "Subscription scheduled for cancellation. Your next delivery remains scheduled; future deliveries are stopped."
      : `Subscription cancelled and ${formatMinor(refundedMinor)} refunded immediately.`,
    {
      subscription: enriched,
      refundedMinor,
      stripeRefundId,
      appliedTo: isPastCutoff ? "future_only" : "upcoming_and_future",
    },
  );
}

/**
 * Add item to a subscription.
 */
async function AddSubscriptionItem({
  customerId,
  subscriptionId,
  variantId,
  quantity,
  refundMethod = "credit",
} = {}) {
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  });
  if (!subscription) return Response(false, "Subscription not found", null);
  if (subscription.status !== "active") {
    return Response(
      false,
      "Paused or cancelled subscriptions cannot be changed.",
      null,
    );
  }

  const variant = await ProductVariant.findById(variantId).populate(
    "product",
    "name status isSubscriptionEligible",
  );
  if (!variant || variant.status !== "active") {
    return Response(false, "Product is not available", null);
  }
  if (!variant.product || variant.product.status !== "active") {
    return Response(false, "Product is not available", null);
  }
  if (!variant.product.isSubscriptionEligible) {
    return Response(false, "This product is not subscription eligible", null);
  }

  const customer = await Customer.findById(customerId);

  const { isPastCutoff } = await getCutoffStatus(subscription);
  const baseline =
    isPastCutoff && subscription.pendingChanges?.items?.length
      ? itemsToPlain(subscription.pendingChanges.items)
      : itemsToPlain(subscription.items);

  const nextItems = [...baseline];
  const existingIndex = nextItems.findIndex(
    (i) => String(i.variant) === String(variantId),
  );

  if (existingIndex >= 0) {
    nextItems[existingIndex] = {
      ...nextItems[existingIndex],
      quantity: nextItems[existingIndex].quantity + quantity,
    };
  } else {
    nextItems.push({
      product: variant.product._id,
      variant: variant._id,
      name: `${variant.product.name} – ${variant.name}`,
      sku: variant.sku,
      quantity,
      unitPrice: variant.price,
    });
  }

  return applyItemChange(
    subscription,
    customer,
    nextItems,
    "Subscription items updated",
    refundMethod,
  );
}

/**
 * Update a subscription item quantity.
 */
async function UpdateSubscriptionItem({
  customerId,
  subscriptionId,
  itemId,
  quantity,
  refundMethod = "credit",
} = {}) {
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  });
  if (!subscription) return Response(false, "Subscription not found", null);
  if (subscription.status !== "active") {
    return Response(
      false,
      "Paused or cancelled subscriptions cannot be changed.",
      null,
    );
  }

  const item = subscription.items.id(itemId);
  if (!item) return Response(false, "Item not found", null);

  const customer = await Customer.findById(customerId);
  const targetVariant = String(item.variant);

  const { isPastCutoff } = await getCutoffStatus(subscription);
  const baseline =
    isPastCutoff && subscription.pendingChanges?.items?.length
      ? itemsToPlain(subscription.pendingChanges.items)
      : itemsToPlain(subscription.items);

  const nextItems = baseline.map((i) =>
    String(i.variant) === targetVariant ? { ...i, quantity } : i,
  );

  return applyItemChange(
    subscription,
    customer,
    nextItems,
    "Subscription items updated",
    refundMethod,
  );
}

/**
 * Remove a subscription item.
 */
async function RemoveSubscriptionItem({
  customerId,
  subscriptionId,
  itemId,
  refundMethod = "credit",
} = {}) {
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  });
  if (!subscription) return Response(false, "Subscription not found", null);
  if (subscription.status !== "active") {
    return Response(
      false,
      "Paused or cancelled subscriptions cannot be changed.",
      null,
    );
  }

  const item = subscription.items.id(itemId);
  if (!item) return Response(false, "Item not found", null);

  if (subscription.items.length <= 1) {
    return Response(
      false,
      "Cannot remove the last item. Please cancel the subscription instead.",
      null,
    );
  }

  const customer = await Customer.findById(customerId);
  const targetVariant = String(item.variant);

  const { isPastCutoff } = await getCutoffStatus(subscription);
  const baseline =
    isPastCutoff && subscription.pendingChanges?.items?.length
      ? itemsToPlain(subscription.pendingChanges.items)
      : itemsToPlain(subscription.items);

  const nextItems = baseline.filter((i) => String(i.variant) !== targetVariant);

  if (nextItems.length === 0) {
    return Response(
      false,
      "Cannot remove the last item. Please cancel the subscription instead.",
      null,
    );
  }

  return applyItemChange(
    subscription,
    customer,
    nextItems,
    "Subscription items updated",
    refundMethod,
  );
}

/**
 * Get scheduled deliveries for a subscription.
 */
async function GetSubscriptionDeliveries({
  customerId,
  subscriptionId,
  page = 1,
  pageSize = 20,
} = {}) {
  // Verify ownership
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  }).lean();
  if (!subscription) return Response(false, "Subscription not found", null);

  const total = await SubscriptionDelivery.countDocuments({
    subscription: subscriptionId,
  });
  const deliveries = await SubscriptionDelivery.find({
    subscription: subscriptionId,
  })
    .populate("order", "orderId status deliveryStatus total")
    .sort({ scheduledDate: 1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  return Response(true, null, { deliveries, meta: { page, pageSize, total } });
}

/**
 * Expose delivery-day + cut-off settings to the customer portal so the UI can
 * limit delivery-day choices and explain the modification cut-off.
 */
async function GetSubscriptionSettingsForCustomer() {
  const settings = await subscriptionSettingsService.getOrCreateSettings();
  return Response(true, null, {
    settings: {
      deliveryDays: settings.deliveryDays,
      cutoffDaysBefore: settings.cutoffDaysBefore,
      cutoffTime: settings.cutoffTime,
    },
  });
}

module.exports = {
  CreateSubscription,
  ListSubscriptions,
  GetSubscription,
  UpdateSubscription,
  AutoResumePausedSubscriptions,
  PauseSubscription,
  ResumeSubscription,
  CancelSubscription,
  AddSubscriptionItem,
  UpdateSubscriptionItem,
  RemoveSubscriptionItem,
  GetSubscriptionDeliveries,
  GetSubscriptionSettingsForCustomer,
  calculateNextDeliveryDate,
  addFrequencyDays,
  scheduleUpcomingDeliveries,
  promotePendingChanges,
  syncStripeSubscriptionPrice,
  getCutoffStatus,
  computeCutoffDate,
};
