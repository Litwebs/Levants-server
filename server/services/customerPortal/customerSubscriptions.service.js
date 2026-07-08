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

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function normalizeWeekdays(days = []) {
  const cleaned = (Array.isArray(days) ? days : [])
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return [...new Set(cleaned)].sort((a, b) => a - b);
}

function resolveDeliveryDays({
  frequency,
  preferredDeliveryDay,
  preferredDeliveryDays,
} = {}) {
  const normalizedDays = normalizeWeekdays(preferredDeliveryDays || []);
  const legacyDay = Number(preferredDeliveryDay);
  const hasLegacyDay =
    Number.isInteger(legacyDay) && legacyDay >= 0 && legacyDay <= 6;

  if (frequency === "weekly") {
    const weeklyDays =
      normalizedDays.length > 0
        ? normalizedDays
        : hasLegacyDay
          ? [legacyDay]
          : [];
    return {
      ok: weeklyDays.length > 0,
      days: weeklyDays,
      primaryDay: weeklyDays[0],
    };
  }

  const singleDay = hasLegacyDay
    ? legacyDay
    : normalizedDays.length > 0
      ? normalizedDays[0]
      : null;
  return {
    ok: singleDay !== null,
    days: singleDay === null ? [] : [singleDay],
    primaryDay: singleDay,
  };
}

function getEffectiveDeliveryDays(subscription) {
  const resolved = resolveDeliveryDays({
    frequency: subscription?.frequency,
    preferredDeliveryDay: subscription?.preferredDeliveryDay,
    preferredDeliveryDays: subscription?.preferredDeliveryDays,
  });
  return resolved.ok ? resolved.days : [2];
}

async function getUpcomingDeliveryDate(
  subscriptionId,
  referenceDate = new Date(),
) {
  const delivery = await SubscriptionDelivery.findOne({
    subscription: subscriptionId,
    status: { $in: ["scheduled", "generated"] },
    scheduledDate: { $gte: startOfDay(referenceDate) },
  })
    .sort({ scheduledDate: 1 })
    .lean();

  return delivery?.scheduledDate ? new Date(delivery.scheduledDate) : null;
}

function calculateSubscriptionTotalMinor(items = []) {
  return items.reduce((sum, item) => {
    const unitPriceMinor = Math.round(Number(item?.unitPrice || 0) * 100);
    const quantity = Math.max(0, Number(item?.quantity || 0));
    return sum + unitPriceMinor * quantity;
  }, 0);
}

function calculateDayPlanTotalMinor(dayPlans = []) {
  return (Array.isArray(dayPlans) ? dayPlans : []).reduce(
    (sum, plan) => sum + calculateSubscriptionTotalMinor(plan?.items || []),
    0,
  );
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
  const dayPlans = Array.isArray(subscription.deliveryDayPlans)
    ? subscription.deliveryDayPlans
    : [];
  const pendingItems = Array.isArray(subscription.pendingChanges?.items)
    ? subscription.pendingChanges.items
    : [];
  const pendingDayPlans = Array.isArray(
    subscription.pendingChanges?.deliveryDayPlans,
  )
    ? subscription.pendingChanges.deliveryDayPlans
    : [];

  const variantIds = [
    ...items,
    ...pendingItems,
    ...dayPlans.flatMap((plan) => plan?.items || []),
    ...pendingDayPlans.flatMap((plan) => plan?.items || []),
  ]
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

  const withImage = (item) => ({
    ...item,
    imageUrl: imageByVariantId.get(String(item?.variant || "")) || null,
  });

  subscription.items = items.map(withImage);
  if (dayPlans.length) {
    subscription.deliveryDayPlans = dayPlans.map((plan) => ({
      ...plan,
      items: (plan.items || []).map(withImage),
    }));
  }
  if (subscription.pendingChanges) {
    if (pendingItems.length) {
      subscription.pendingChanges.items = pendingItems.map(withImage);
    }
    if (pendingDayPlans.length) {
      subscription.pendingChanges.deliveryDayPlans = pendingDayPlans.map(
        (plan) => ({
          ...plan,
          items: (plan.items || []).map(withImage),
        }),
      );
    }
  }

  return subscription;
}

/**
 * Calculate the next delivery date given a preferred day and frequency.
 * @param {number} preferredDay - 0-6 (Sun-Sat)
 * @param {string} frequency
 * @param {Date} [from] - reference date, defaults to now
 */
function calculateNextDeliveryDate(
  preferredDay,
  frequency,
  from = new Date(),
  preferredDays = [],
) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);

  const deliveryDays = resolveDeliveryDays({
    frequency,
    preferredDeliveryDay: preferredDay,
    preferredDeliveryDays: preferredDays,
  }).days;
  if (!deliveryDays.length) {
    return new Date(start);
  }

  const currentDay = start.getDay();
  let daysUntilPreferred = 7;
  for (const day of deliveryDays) {
    let distance = (day - currentDay + 7) % 7;
    // For the FIRST scheduled delivery, use the next weekday occurrence.
    // Frequency controls the cadence AFTER that first delivery.
    if (distance === 0) distance = 7;
    if (distance < daysUntilPreferred) daysUntilPreferred = distance;
  }

  const next = new Date(start);
  next.setDate(start.getDate() + daysUntilPreferred);
  return next;
}

function addFrequencyDays(date, frequency, preferredDays = []) {
  if (frequency === "weekly") {
    return calculateNextDeliveryDate(
      preferredDays[0] ?? 2,
      frequency,
      date,
      preferredDays,
    );
  }

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
  const deliveryDays = getEffectiveDeliveryDays(subscription);

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
    nextDate = addFrequencyDays(nextDate, subscription.frequency, deliveryDays);
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
        subscription.preferredDeliveryDays,
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
 * Multi-day variant: update the upcoming order for a SPECIFIC delivery weekday
 * using only that day's plan items. Each delivery day has its own generated
 * order, so a change to one day must not overwrite another day's order with the
 * merged multi-day item list.
 */
async function updateUpcomingSubscriptionOrderForDay(
  subscription,
  weekday,
  dayItems,
  { chargedMinor = 0, refundedMinor = 0 } = {},
) {
  const orders = await Order.find({
    subscription: subscription._id,
    status: { $in: ["paid", "partially_refunded"] },
    deliveryStatus: "ordered",
  })
    .sort({ deliveryDate: 1 })
    .exec();

  const order = orders.find(
    (candidate) =>
      candidate.deliveryDate &&
      new Date(candidate.deliveryDate).getDay() === Number(weekday),
  );

  if (!order) return false;

  order.items = (dayItems || []).map((item) => ({
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
  const { isPastCutoff, settings } = await getCutoffStatus(subscription);
  const upcomingDeliveryDate = await getUpcomingDeliveryDate(subscription._id);
  const upcomingCutoffAt = computeCutoffDate(upcomingDeliveryDate, settings);
  const isPastUpcomingCutoff = upcomingCutoffAt
    ? Date.now() >= upcomingCutoffAt.getTime()
    : false;
  const effectiveIsPastCutoff = isPastCutoff || isPastUpcomingCutoff;
  const hasStagedPendingItems =
    Array.isArray(subscription.pendingChanges?.items) &&
    subscription.pendingChanges.items.length > 0;
  const shouldStageForNextInvoice =
    effectiveIsPastCutoff || hasStagedPendingItems;

  if (shouldStageForNextInvoice) {
    // Anchor on the delivery the customer actually sees as upcoming, so the
    // staged change applies from the NEXT delivery after that one (not one
    // cycle past the internal billing anchor, which can be a cycle later).
    const stagingAnchor = upcomingDeliveryDate || subscription.nextDeliveryDate;
    const effectiveFrom = stagingAnchor
      ? addFrequencyDays(
          stagingAnchor,
          subscription.frequency,
          getEffectiveDeliveryDays(subscription),
        )
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
  if (Array.isArray(pending.deliveryDayPlans)) {
    subscription.deliveryDayPlans = pending.deliveryDayPlans.length
      ? pending.deliveryDayPlans
      : undefined;
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
  if (Array.isArray(pending.preferredDeliveryDays)) {
    const cleanedDays = normalizeWeekdays(pending.preferredDeliveryDays);
    subscription.preferredDeliveryDays = cleanedDays.length
      ? cleanedDays
      : undefined;
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
  preferredDeliveryDays,
  deliveryDayPlans,
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

  // Delivery day(s) must be days the business actually delivers on.
  const settings = await subscriptionSettingsService.getOrCreateSettings();
  const resolvedDays = resolveDeliveryDays({
    frequency,
    preferredDeliveryDay,
    preferredDeliveryDays,
  });
  if (!resolvedDays.ok) {
    return Response(
      false,
      "Please choose at least one valid delivery day.",
      null,
    );
  }
  const hasUnavailableDay = resolvedDays.days.some(
    (day) => !settings.deliveryDays.includes(Number(day)),
  );
  if (hasUnavailableDay) {
    return Response(
      false,
      "One or more selected delivery days are not available. Please choose available days.",
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

  const baseItems = Array.isArray(items) ? items : [];
  const rawDayPlans = Array.isArray(deliveryDayPlans) ? deliveryDayPlans : [];
  const planItems = rawDayPlans.flatMap((plan) => plan.items || []);
  const allInputItems = [...baseItems, ...planItems];

  if (allInputItems.length === 0) {
    return Response(false, "Please select at least one product.", null);
  }

  // Resolve variants
  const variantIds = allInputItems.map(
    (i) => new mongoose.Types.ObjectId(i.variantId),
  );
  const variants = await ProductVariant.find({
    _id: { $in: variantIds },
    status: "active",
  }).populate("product", "name status isSubscriptionEligible");

  if (variants.length !== new Set(variantIds.map(String)).size) {
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
  const toSnapshotItem = (item) => {
    const variant = variantMap.get(String(item.variantId));
    return {
      product: variant.product._id,
      variant: variant._id,
      name: `${variant.product.name} – ${variant.name}`,
      sku: variant.sku,
      quantity: item.quantity,
      unitPrice: variant.price,
    };
  };

  let resolvedDayPlans;
  if (frequency === "weekly" && resolvedDays.days.length > 1) {
    if (rawDayPlans.length > 0) {
      const selectedDaySet = new Set(resolvedDays.days.map(Number));
      const seen = new Set();
      let dayPlanError = null;
      resolvedDayPlans = rawDayPlans.map((plan) => {
        const day = Number(plan.day);
        if (!selectedDaySet.has(day)) {
          dayPlanError =
            "One or more day plans use an unavailable delivery day.";
          return { day, items: [] };
        }
        if (seen.has(day)) {
          dayPlanError = "Duplicate day plans are not allowed.";
          return { day, items: [] };
        }
        seen.add(day);
        const dayItems = (plan.items || []).map(toSnapshotItem);
        if (dayItems.length === 0) {
          dayPlanError = "Each selected day must have at least one product.";
          return { day, items: [] };
        }
        return { day, items: dayItems };
      });
      if (dayPlanError) {
        return Response(false, dayPlanError, null);
      }
      for (const day of resolvedDays.days) {
        if (!seen.has(Number(day))) {
          return Response(
            false,
            "Please configure products for each selected delivery day.",
            null,
          );
        }
      }
    } else {
      const defaultItems = baseItems.map(toSnapshotItem);
      resolvedDayPlans = resolvedDays.days.map((day) => ({
        day,
        items: defaultItems,
      }));
    }
  }

  let subscriptionItems;
  if (resolvedDayPlans?.length) {
    const mergedByVariant = new Map();
    for (const plan of resolvedDayPlans) {
      for (const item of plan.items) {
        const key = String(item.variant);
        const existing = mergedByVariant.get(key);
        if (existing) {
          existing.quantity += Number(item.quantity || 0);
        } else {
          mergedByVariant.set(key, {
            ...item,
            quantity: Number(item.quantity || 0),
          });
        }
      }
    }
    subscriptionItems = Array.from(mergedByVariant.values()).filter(
      (item) => item.quantity > 0,
    );
  } else {
    subscriptionItems = baseItems.map(toSnapshotItem);
  }

  const effectiveNowMs = await getEffectiveNowMs(customer.stripeCustomerId);

  const nextDeliveryDate = calculateNextDeliveryDate(
    resolvedDays.primaryDay,
    frequency,
    new Date(effectiveNowMs),
    resolvedDays.days,
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
    preferredDeliveryDay: resolvedDays.primaryDay,
    preferredDeliveryDays:
      frequency === "weekly" ? resolvedDays.days : undefined,
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
    deliveryDayPlans: resolvedDayPlans,
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

  const subscriptionsWithScheduleLabels = await Promise.all(
    subscriptions.map(async (subscription) => {
      const effectiveDays = getEffectiveDeliveryDays(subscription);
      const preferredDeliveryDaysLabel = effectiveDays
        .map((day) => WEEKDAY_NAMES[day])
        .filter(Boolean)
        .join(", ");
      const upcomingDeliveryDate = await getUpcomingDeliveryDate(
        subscription._id,
      );

      return {
        ...subscription,
        preferredDeliveryDaysLabel,
        upcomingDeliveryDate: upcomingDeliveryDate
          ? upcomingDeliveryDate.toISOString()
          : null,
      };
    }),
  );

  return Response(true, null, {
    subscriptions: subscriptionsWithScheduleLabels,
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
  const upcomingDeliveryDate = await getUpcomingDeliveryDate(subscription._id);

  const settings = await subscriptionSettingsService.getOrCreateSettings();
  const cutoffAt = computeCutoffDate(
    upcomingDeliveryDate || enriched.nextDeliveryDate,
    settings,
  );
  const isPastCutoff = cutoffAt ? Date.now() >= cutoffAt.getTime() : false;

  return Response(true, null, {
    subscription: {
      ...enriched,
      upcomingDeliveryDate: upcomingDeliveryDate
        ? upcomingDeliveryDate.toISOString()
        : null,
    },
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
  preferredDeliveryDays,
  deliveryDayPlans,
  changedDeliveryDays: requestedChangedDeliveryDays,
  deliveryAddressId,
  notes,
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

  const settings = await subscriptionSettingsService.getOrCreateSettings();

  const targetFrequency = frequency ?? subscription.frequency;
  const targetDayValue =
    preferredDeliveryDay ?? subscription.preferredDeliveryDay;
  const targetDaysValue =
    preferredDeliveryDays !== undefined
      ? preferredDeliveryDays
      : preferredDeliveryDay !== undefined && targetFrequency === "weekly"
        ? [preferredDeliveryDay]
        : subscription.preferredDeliveryDays;
  const resolvedDays = resolveDeliveryDays({
    frequency: targetFrequency,
    preferredDeliveryDay: targetDayValue,
    preferredDeliveryDays: targetDaysValue,
  });
  if (!resolvedDays.ok) {
    return Response(
      false,
      "Please choose at least one valid delivery day.",
      null,
    );
  }
  const hasUnavailableDay = resolvedDays.days.some(
    (day) => !settings.deliveryDays.includes(Number(day)),
  );
  if (hasUnavailableDay) {
    return Response(
      false,
      "One or more selected delivery days are not available. Please choose available days.",
      null,
    );
  }

  const { isPastCutoff } = await getCutoffStatus(subscription);

  const dayPlanChangeRequested = deliveryDayPlans !== undefined;
  const shouldUseDayPlans =
    targetFrequency === "weekly" && resolvedDays.days.length > 1;
  let resolvedDeliveryDayPlans;
  let resolvedSubscriptionItems;
  let changedDeliveryDays = [];
  let openChangedDeliveryDays = [];
  let lockedChangedDeliveryDays = [];
  let currentLiveDayPlans = [];
  let liveDeliveryDayPlans = null;
  let liveSubscriptionItems = null;
  let currentLiveSubscriptionItems = null;
  let currentWorkingPlans = [];
  let currentWorkingSubscriptionItems = [];
  let openDayCurrentMinor = 0;
  let openDayNewMinor = 0;
  let shouldStageFutureDayPlan = false;
  let hasExistingPendingDayPlan = false;

  if (dayPlanChangeRequested) {
    if (!shouldUseDayPlans) {
      return Response(
        false,
        "Day-specific plans are only available for weekly subscriptions with multiple delivery days.",
        null,
      );
    }

    const rawDayPlans = Array.isArray(deliveryDayPlans) ? deliveryDayPlans : [];
    if (!rawDayPlans.length) {
      return Response(
        false,
        "Please configure products for each selected delivery day.",
        null,
      );
    }

    const allInputItems = rawDayPlans.flatMap((plan) => plan.items || []);
    if (!allInputItems.length) {
      return Response(false, "Please select at least one product.", null);
    }

    const variantIds = allInputItems.map(
      (item) => new mongoose.Types.ObjectId(item.variantId),
    );
    const variants = await ProductVariant.find({
      _id: { $in: variantIds },
      status: "active",
    }).populate("product", "name status isSubscriptionEligible");

    if (variants.length !== new Set(variantIds.map(String)).size) {
      return Response(false, "One or more products are unavailable", null);
    }

    for (const variant of variants) {
      if (!variant.product || variant.product.status !== "active") {
        return Response(
          false,
          `Product "${variant.name}" is not available`,
          null,
        );
      }
      if (!variant.product.isSubscriptionEligible) {
        return Response(
          false,
          `"${variant.product.name}" is not eligible for subscriptions`,
          null,
        );
      }
    }

    const variantMap = new Map(variants.map((v) => [String(v._id), v]));
    const toSnapshotItem = (item) => {
      const variant = variantMap.get(String(item.variantId));
      return {
        product: variant.product._id,
        variant: variant._id,
        name: `${variant.product.name} – ${variant.name}`,
        sku: variant.sku,
        quantity: item.quantity,
        unitPrice: variant.price,
      };
    };

    const selectedDaySet = new Set(resolvedDays.days.map(Number));
    const seen = new Set();
    let dayPlanError = null;
    resolvedDeliveryDayPlans = rawDayPlans.map((plan) => {
      const day = Number(plan.day);
      if (!selectedDaySet.has(day)) {
        dayPlanError = "One or more day plans use an unavailable delivery day.";
        return { day, items: [] };
      }
      if (seen.has(day)) {
        dayPlanError = "Duplicate day plans are not allowed.";
        return { day, items: [] };
      }
      seen.add(day);
      const dayItems = (plan.items || []).map(toSnapshotItem);
      if (dayItems.length === 0) {
        dayPlanError = "Each selected day must have at least one product.";
        return { day, items: [] };
      }
      return { day, items: dayItems };
    });

    if (dayPlanError) {
      return Response(false, dayPlanError, null);
    }

    for (const day of resolvedDays.days) {
      if (!seen.has(Number(day))) {
        return Response(
          false,
          "Please configure products for each selected delivery day.",
          null,
        );
      }
    }

    const mergedByVariant = new Map();
    for (const plan of resolvedDeliveryDayPlans) {
      for (const item of plan.items) {
        const key = String(item.variant);
        const existing = mergedByVariant.get(key);
        if (existing) {
          existing.quantity += Number(item.quantity || 0);
        } else {
          mergedByVariant.set(key, {
            ...item,
            quantity: Number(item.quantity || 0),
          });
        }
      }
    }

    resolvedSubscriptionItems = Array.from(mergedByVariant.values()).filter(
      (item) => item.quantity > 0,
    );
    if (!resolvedSubscriptionItems.length) {
      return Response(false, "Please select at least one product.", null);
    }

    const toDayPlanArray = (plans, fallbackItems = []) => {
      if (Array.isArray(plans) && plans.length > 0) {
        return plans.map((plan) => ({
          day: Number(plan.day),
          items: itemsToPlain(plan.items || []),
        }));
      }

      return resolvedDays.days.map((day) => ({
        day: Number(day),
        items: itemsToPlain(fallbackItems),
      }));
    };

    const normalizePlanItems = (items = []) =>
      (items || [])
        .map((item) => ({
          variant: String(item.variant || item.variantId || ""),
          quantity: Number(item.quantity || 0),
        }))
        .filter((item) => item.variant && item.quantity > 0)
        .sort((a, b) => a.variant.localeCompare(b.variant));

    const mergeSubscriptionItemsFromPlans = (plans = []) => {
      const mergedByVariant = new Map();
      for (const plan of plans) {
        for (const item of plan.items || []) {
          const key = String(item.variant || "");
          const quantity = Number(item.quantity || 0);
          if (!key || quantity <= 0) continue;
          const existing = mergedByVariant.get(key);
          if (existing) {
            existing.quantity += quantity;
          } else {
            mergedByVariant.set(key, { ...item, quantity });
          }
        }
      }
      return Array.from(mergedByVariant.values()).filter(
        (item) => item.quantity > 0,
      );
    };

    const isDayPastOwnCutoff = (day) => {
      const deliveryDateForDay = calculateNextDeliveryDate(
        day,
        targetFrequency,
        new Date(Date.now()),
        [day],
      );
      const cutoffForDay = computeCutoffDate(deliveryDateForDay, settings);
      return cutoffForDay ? Date.now() >= cutoffForDay.getTime() : false;
    };

    const currentLivePlans = toDayPlanArray(
      subscription.deliveryDayPlans,
      subscription.items,
    );
    currentLiveDayPlans = currentLivePlans;
    currentWorkingPlans = currentLivePlans;
    hasExistingPendingDayPlan =
      Array.isArray(subscription.pendingChanges?.deliveryDayPlans) &&
      subscription.pendingChanges.deliveryDayPlans.length > 0;
    const baselinePlans = hasExistingPendingDayPlan
      ? subscription.pendingChanges.deliveryDayPlans
      : currentLivePlans;

    const baselineByDay = new Map(
      baselinePlans.map((plan) => [
        Number(plan.day),
        JSON.stringify(normalizePlanItems(plan.items || [])),
      ]),
    );

    changedDeliveryDays = Array.isArray(requestedChangedDeliveryDays)
      ? [...new Set(requestedChangedDeliveryDays.map(Number))].filter((day) =>
          resolvedDays.days.includes(day),
        )
      : resolvedDeliveryDayPlans
          .filter((plan) => {
            const nextValue = JSON.stringify(
              normalizePlanItems(plan.items || []),
            );
            return baselineByDay.get(Number(plan.day)) !== nextValue;
          })
          .map((plan) => Number(plan.day));

    openChangedDeliveryDays = changedDeliveryDays.filter(
      (day) => !isDayPastOwnCutoff(day),
    );
    lockedChangedDeliveryDays = changedDeliveryDays.filter((day) =>
      isDayPastOwnCutoff(day),
    );

    const requestedByDay = new Map(
      resolvedDeliveryDayPlans.map((plan) => [Number(plan.day), plan]),
    );
    const liveByDay = new Map(
      currentLivePlans.map((plan) => [
        Number(plan.day),
        { ...plan, items: itemsToPlain(plan.items || []) },
      ]),
    );

    for (const day of openChangedDeliveryDays) {
      const requestedPlan = requestedByDay.get(Number(day));
      if (requestedPlan) {
        liveByDay.set(Number(day), {
          day: Number(requestedPlan.day),
          items: itemsToPlain(requestedPlan.items || []),
        });
      }
    }

    liveDeliveryDayPlans = resolvedDays.days.map(
      (day) =>
        liveByDay.get(Number(day)) || {
          day: Number(day),
          items: [],
        },
    );
    currentLiveSubscriptionItems =
      mergeSubscriptionItemsFromPlans(currentLivePlans);
    currentWorkingSubscriptionItems =
      mergeSubscriptionItemsFromPlans(currentWorkingPlans);
    liveSubscriptionItems =
      mergeSubscriptionItemsFromPlans(liveDeliveryDayPlans);
    shouldStageFutureDayPlan =
      lockedChangedDeliveryDays.length > 0 || hasExistingPendingDayPlan;

    const dayPlanMinor = (items = []) =>
      (items || []).reduce((daySum, item) => {
        const unitPriceMinor = Math.round(Number(item?.unitPrice || 0) * 100);
        const quantity = Math.max(0, Number(item?.quantity || 0));
        return daySum + unitPriceMinor * quantity;
      }, 0);

    const currentLiveByDay = new Map(
      currentLiveDayPlans.map((plan) => [Number(plan.day), plan]),
    );

    openDayCurrentMinor = openChangedDeliveryDays.reduce((sum, day) => {
      const currentPlan = currentLiveByDay.get(Number(day));
      return sum + dayPlanMinor(currentPlan?.items || []);
    }, 0);

    openDayNewMinor = openChangedDeliveryDays.reduce((sum, day) => {
      const requestedPlan = requestedByDay.get(Number(day));
      return sum + dayPlanMinor(requestedPlan?.items || []);
    }, 0);
  }

  const effectiveIsPastCutoff =
    dayPlanChangeRequested && shouldUseDayPlans
      ? lockedChangedDeliveryDays.length > 0
      : isPastCutoff;

  const dayPlanAggregateCurrentMinor = dayPlanChangeRequested
    ? shouldUseDayPlans
      ? openDayCurrentMinor
      : calculateSubscriptionTotalMinor(subscription.items)
    : 0;
  const dayPlanAggregateNewMinor = dayPlanChangeRequested
    ? shouldUseDayPlans
      ? openDayNewMinor
      : calculateSubscriptionTotalMinor(resolvedSubscriptionItems)
    : 0;

  const dayPlanDeltaMinor =
    dayPlanAggregateNewMinor - dayPlanAggregateCurrentMinor;
  const dayPlanChargeMinor = Math.max(dayPlanDeltaMinor, 0);
  const dayPlanRefundOwedMinor = Math.max(-dayPlanDeltaMinor, 0);

  let dayPlanCreditedMinor = 0;
  let dayPlanRefundedMinor = 0;
  let dayPlanStripeRefundId = null;
  let updateMessage = "Subscription updated";

  if (
    dayPlanChangeRequested &&
    openChangedDeliveryDays.length > 0 &&
    dayPlanChargeMinor > 0
  ) {
    const customer = await Customer.findById(customerId);
    const charge = await chargeDeltaNow(
      subscription,
      customer,
      dayPlanChargeMinor,
      `Subscription change – ${subscription.subscriptionNumber}`,
    );
    if (!charge.ok) {
      return Response(false, charge.message, null);
    }
  }

  if (
    dayPlanChangeRequested &&
    openChangedDeliveryDays.length > 0 &&
    dayPlanRefundOwedMinor > 0
  ) {
    if (refundMethod === "refund") {
      const refundableOrder = await Order.findOne({
        subscription: subscription._id,
        status: { $in: ["paid", "partially_refunded"] },
        stripePaymentIntentId: { $ne: null },
      })
        .sort({ paidAt: -1, createdAt: -1 })
        .select("_id")
        .lean();

      if (!refundableOrder) {
        return Response(
          false,
          "We couldn't find a captured payment to refund to your card. Please choose store credit instead.",
          null,
        );
      }
    }

    if (refundMethod === "refund") {
      const refundResult = await refundSubscriptionToCard(
        subscription,
        dayPlanRefundOwedMinor,
      );
      dayPlanRefundedMinor = refundResult.refundedMinor;
      dayPlanStripeRefundId = refundResult.stripeRefundId;
    }

    const remainderMinor = dayPlanRefundOwedMinor - dayPlanRefundedMinor;
    if (remainderMinor > 0) {
      const creditResult = await storeCreditService.addCredit({
        customerId,
        amountMinor: remainderMinor,
        type: "subscription_refund",
        reason: `Refund for reducing ${subscription.subscriptionNumber}`,
        subscriptionId: subscription._id,
      });
      if (creditResult.ok) {
        dayPlanCreditedMinor = remainderMinor;
      }
    }

    if (dayPlanRefundedMinor > 0 && dayPlanCreditedMinor > 0) {
      updateMessage = `We've refunded ${formatMinor(dayPlanRefundedMinor)} to your card and added ${formatMinor(dayPlanCreditedMinor)} as store credit.`;
    } else if (dayPlanRefundedMinor > 0) {
      updateMessage = `We've refunded ${formatMinor(dayPlanRefundedMinor)} to your card.`;
    } else if (dayPlanCreditedMinor > 0) {
      updateMessage = `We've added ${formatMinor(dayPlanCreditedMinor)} of store credit to your account.`;
    }
  }

  const scheduleChangeRequested =
    frequency !== undefined ||
    preferredDeliveryDay !== undefined ||
    preferredDeliveryDays !== undefined;
  const effectiveFromDate = subscription.nextDeliveryDate
    ? addFrequencyDays(
        subscription.nextDeliveryDate,
        subscription.frequency,
        getEffectiveDeliveryDays(subscription),
      )
    : null;
  let shouldSyncStripePrice = false;

  if (scheduleChangeRequested && effectiveIsPastCutoff) {
    subscription.pendingChanges = {
      ...(subscription.pendingChanges
        ? subscription.pendingChanges.toObject?.() ||
          subscription.pendingChanges
        : {}),
      frequency: targetFrequency,
      preferredDeliveryDay: resolvedDays.primaryDay,
      preferredDeliveryDays:
        targetFrequency === "weekly" ? resolvedDays.days : undefined,
      deliveryDayPlans: !shouldUseDayPlans ? [] : undefined,
      effectiveFrom: effectiveFromDate,
    };
  } else {
    if (frequency !== undefined) subscription.frequency = frequency;
    if (scheduleChangeRequested) {
      subscription.preferredDeliveryDay = resolvedDays.primaryDay;
      subscription.preferredDeliveryDays =
        targetFrequency === "weekly" ? resolvedDays.days : undefined;
      if (!shouldUseDayPlans && !dayPlanChangeRequested) {
        subscription.deliveryDayPlans = undefined;
      }
    }
  }

  if (dayPlanChangeRequested && shouldStageFutureDayPlan) {
    subscription.pendingChanges = {
      ...(subscription.pendingChanges
        ? subscription.pendingChanges.toObject?.() ||
          subscription.pendingChanges
        : {}),
      items: resolvedSubscriptionItems,
      deliveryDayPlans: resolvedDeliveryDayPlans,
      effectiveFrom: effectiveFromDate,
    };
  }

  if (dayPlanChangeRequested && openChangedDeliveryDays.length > 0) {
    subscription.items = liveSubscriptionItems;
    subscription.deliveryDayPlans = liveDeliveryDayPlans;
    shouldSyncStripePrice = true;
  } else if (dayPlanChangeRequested && !shouldStageFutureDayPlan) {
    subscription.items = resolvedSubscriptionItems;
    subscription.deliveryDayPlans = resolvedDeliveryDayPlans;
    shouldSyncStripePrice = true;
  }

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

    if (effectiveIsPastCutoff) {
      // Cut-off passed for the upcoming delivery → apply from the next one.
      subscription.pendingChanges = {
        ...(subscription.pendingChanges
          ? subscription.pendingChanges.toObject?.() ||
            subscription.pendingChanges
          : {}),
        deliveryAddress: newAddress,
        effectiveFrom: effectiveFromDate,
      };
    } else {
      subscription.deliveryAddress = newAddress;
    }
  }

  // Recalculate next delivery date if frequency or day changed
  if (scheduleChangeRequested && !effectiveIsPastCutoff) {
    subscription.nextDeliveryDate = calculateNextDeliveryDate(
      subscription.preferredDeliveryDay,
      subscription.frequency,
      new Date(),
      subscription.preferredDeliveryDays,
    );
    // Generate new upcoming delivery slots
    await scheduleUpcomingDeliveries(subscription);
  }

  await subscription.save();
  if (dayPlanChangeRequested && shouldStageFutureDayPlan) {
    await syncStripeSubscriptionPrice(subscription, resolvedSubscriptionItems);
  } else if (shouldSyncStripePrice) {
    await syncStripeSubscriptionPrice(subscription);
  }

  if (dayPlanChangeRequested && openChangedDeliveryDays.length > 0) {
    const currentItemsByDay = new Map(
      (currentLiveDayPlans || []).map((plan) => [
        Number(plan.day),
        plan.items || [],
      ]),
    );
    const newItemsByDay = new Map(
      (liveDeliveryDayPlans || []).map((plan) => [
        Number(plan.day),
        plan.items || [],
      ]),
    );
    const itemsMinor = (items = []) =>
      (items || []).reduce((sum, item) => {
        const unitPriceMinor = Math.round(Number(item?.unitPrice || 0) * 100);
        const quantity = Math.max(0, Number(item?.quantity || 0));
        return sum + unitPriceMinor * quantity;
      }, 0);

    for (const day of openChangedDeliveryDays) {
      const dayNewItems = newItemsByDay.get(Number(day)) || [];
      const dayDeltaMinor =
        itemsMinor(dayNewItems) -
        itemsMinor(currentItemsByDay.get(Number(day)) || []);

      await updateUpcomingSubscriptionOrderForDay(
        subscription,
        Number(day),
        dayNewItems,
        {
          chargedMinor: Math.max(dayDeltaMinor, 0),
          refundedMinor: Math.max(-dayDeltaMinor, 0),
        },
      );
    }
  }

  await CustomerNotification.create({
    customer: customerId,
    type: "subscription_updated",
    title: "Subscription updated",
    message: "Your subscription has been updated.",
    relatedSubscription: subscription._id,
  });

  const enriched = await enrichSubscriptionWithVariantImages(subscription);
  const responseData = {
    subscription: {
      ...enriched,
      upcomingDeliveryDate: subscription.nextDeliveryDate
        ? new Date(subscription.nextDeliveryDate).toISOString()
        : null,
    },
  };

  if (
    dayPlanChangeRequested &&
    shouldStageFutureDayPlan &&
    openChangedDeliveryDays.length === 0
  ) {
    responseData.appliedTo = "next";
  }

  if (
    dayPlanChangeRequested &&
    openChangedDeliveryDays.length > 0 &&
    dayPlanChargeMinor > 0
  ) {
    responseData.appliedTo = "upcoming";
    responseData.chargedMinor = dayPlanChargeMinor;
  }

  if (
    dayPlanChangeRequested &&
    openChangedDeliveryDays.length > 0 &&
    dayPlanRefundOwedMinor > 0
  ) {
    responseData.appliedTo = "upcoming";
    responseData.refundedMinor = dayPlanRefundedMinor;
    responseData.creditedMinor = dayPlanCreditedMinor;
    responseData.stripeRefundId = dayPlanStripeRefundId;
  }

  return Response(true, updateMessage, responseData);
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

  const baseline = subscription.pendingChanges?.items?.length
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

  const baseline = subscription.pendingChanges?.items?.length
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

  const baseline = subscription.pendingChanges?.items?.length
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
