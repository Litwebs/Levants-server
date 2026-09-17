"use strict";

const Subscription = require("../../models/subscription.model");
const stripe = require("../../utils/stripe.util");
const logger = require("../../utils/logger.util");

const STRIPE_INTERVALS = {
  weekly: { interval: "week", interval_count: 1 },
  every_two_weeks: { interval: "week", interval_count: 2 },
  monthly: { interval: "month", interval_count: 1 },
};

const SUBSCRIPTION_DELIVERY_FEE_MINOR = 100;

function normalizeWeekdays(days = []) {
  const cleaned = (Array.isArray(days) ? days : [])
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return [...new Set(cleaned)].sort((left, right) => left - right);
}

function pendingValue(subscription, key) {
  const pending = subscription?.pendingChanges;
  if (!pending) return undefined;
  const value = pending[key];
  return value === undefined ? undefined : value;
}

/**
 * Resolve the recurring billing state that Stripe should currently hold.
 *
 * Post-cut-off item edits intentionally live in pendingChanges while Stripe is
 * already moved to the price for the following billable delivery. Therefore
 * pending billing fields take precedence over the live subscription snapshot.
 * This mirrors the existing subscription service rules without changing when a
 * customer is charged, refunded, paused, resumed, or delivered to.
 */
function resolveExpectedStripePrice(subscription) {
  const pendingItems = pendingValue(subscription, "items");
  const items =
    Array.isArray(pendingItems) && pendingItems.length > 0
      ? pendingItems
      : Array.isArray(subscription?.items)
        ? subscription.items
        : [];

  const pendingFrequency = pendingValue(subscription, "frequency");
  const frequency = pendingFrequency || subscription?.frequency || "weekly";
  const interval = STRIPE_INTERVALS[frequency] || STRIPE_INTERVALS.weekly;

  const pendingPreferredDays = pendingValue(
    subscription,
    "preferredDeliveryDays",
  );
  const pendingPreferredDay = pendingValue(subscription, "preferredDeliveryDay");
  const livePreferredDays = subscription?.preferredDeliveryDays;
  const livePreferredDay = subscription?.preferredDeliveryDay;

  let deliveryDays = normalizeWeekdays(
    Array.isArray(pendingPreferredDays) && pendingPreferredDays.length > 0
      ? pendingPreferredDays
      : Array.isArray(livePreferredDays) && livePreferredDays.length > 0
        ? livePreferredDays
        : [],
  );

  const fallbackDay =
    pendingPreferredDay !== undefined && pendingPreferredDay !== null
      ? Number(pendingPreferredDay)
      : Number(livePreferredDay);
  if (
    deliveryDays.length === 0 &&
    Number.isInteger(fallbackDay) &&
    fallbackDay >= 0 &&
    fallbackDay <= 6
  ) {
    deliveryDays = [fallbackDay];
  }

  const itemsMinor = items.reduce((sum, item) => {
    const unitPriceMinor = Math.round(Number(item?.unitPrice || 0) * 100);
    const quantity = Math.max(0, Number(item?.quantity || 0));
    return sum + unitPriceMinor * quantity;
  }, 0);

  const deliveryFeeCount =
    frequency === "weekly" ? Math.max(1, deliveryDays.length) : 1;

  return {
    amountMinor:
      itemsMinor + SUBSCRIPTION_DELIVERY_FEE_MINOR * deliveryFeeCount,
    currency: "gbp",
    frequency,
    interval: interval.interval,
    intervalCount: interval.interval_count,
    deliveryDays,
  };
}

function stripeObjectId(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id || null;
}

async function resolveRemotePrice(remoteSubscription) {
  const remotePrice = remoteSubscription?.items?.data?.[0]?.price;
  if (!remotePrice) return null;
  if (typeof remotePrice === "object") return remotePrice;
  return stripe.prices.retrieve(remotePrice);
}

function remotePriceMatches(remotePrice, expected, stripeProductId) {
  if (!remotePrice) return false;
  const remoteProductId = stripeObjectId(remotePrice.product);
  const recurring = remotePrice.recurring || {};
  return (
    Number(remotePrice.unit_amount) === Number(expected.amountMinor) &&
    String(remotePrice.currency || "").toLowerCase() === expected.currency &&
    recurring.interval === expected.interval &&
    Number(recurring.interval_count || 1) === Number(expected.intervalCount) &&
    (!stripeProductId || remoteProductId === String(stripeProductId))
  );
}

async function persistPendingState(subscription, error) {
  if (!subscription) return;
  subscription.pendingPriceSync = true;
  try {
    await subscription.save();
  } catch (saveError) {
    logger.error(
      `[SubscriptionPriceReconciliation] Could not persist pending sync state for ${subscription.subscriptionNumber || subscription._id}: ${saveError.message}`,
    );
  }

  logger.error(
    `[SubscriptionPriceReconciliation] Stripe price sync pending for ${subscription.subscriptionNumber || subscription._id}: ${error?.message || error}`,
  );
}

function buildTransitionKey(subscription, currentPriceId, expected) {
  const dayKey = expected.deliveryDays.length
    ? expected.deliveryDays.join("-")
    : "none";
  return [
    "subscription-price-reconcile",
    String(subscription._id),
    String(currentPriceId || "none"),
    String(expected.amountMinor),
    expected.frequency,
    dayKey,
  ].join(":");
}

/**
 * Compare the local desired recurring state to Stripe and repair divergence.
 * The method is deliberately idempotent: retrying the same remote transition
 * reuses the same Stripe idempotency keys, so a lost response cannot create a
 * second logical price transition.
 */
async function reconcileSubscriptionPrice(subscriptionOrId) {
  const subscription =
    subscriptionOrId && typeof subscriptionOrId === "object"
      ? subscriptionOrId
      : await Subscription.findById(subscriptionOrId);

  if (!subscription) {
    return { ok: false, action: "missing", message: "Subscription not found" };
  }

  if (
    subscription.status === "cancelled" ||
    subscription.isCancellationScheduled ||
    !subscription.stripeSubscriptionId ||
    !subscription.stripeProductId
  ) {
    return { ok: true, action: "skipped" };
  }

  const expected = resolveExpectedStripePrice(subscription);

  try {
    const remoteSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId,
    );
    const remotePrice = await resolveRemotePrice(remoteSubscription);
    const remotePriceId = stripeObjectId(remotePrice);

    if (remotePriceMatches(remotePrice, expected, subscription.stripeProductId)) {
      let changed = false;
      if (remotePriceId && subscription.stripePriceId !== remotePriceId) {
        subscription.stripePriceId = remotePriceId;
        changed = true;
      }
      if (subscription.pendingPriceSync) {
        subscription.pendingPriceSync = false;
        changed = true;
      }
      if (changed) await subscription.save();
      return {
        ok: true,
        action: "synced",
        priceId: remotePriceId,
        expected,
      };
    }

    if (!remoteSubscription?.items?.data?.[0]?.id) {
      throw new Error("Stripe subscription has no recurring item to update");
    }

    const transitionKey = buildTransitionKey(
      subscription,
      remotePriceId,
      expected,
    );
    const newPrice = await stripe.prices.create(
      {
        product: subscription.stripeProductId,
        currency: expected.currency,
        unit_amount: expected.amountMinor,
        recurring: {
          interval: expected.interval,
          interval_count: expected.intervalCount,
        },
      },
      { idempotencyKey: `${transitionKey}:price` },
    );

    await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        items: [
          {
            id: remoteSubscription.items.data[0].id,
            price: newPrice.id,
          },
        ],
        proration_behavior: "none",
      },
      { idempotencyKey: `${transitionKey}:attach` },
    );

    const previousPriceId = remotePriceId || subscription.stripePriceId;
    subscription.stripePriceId = newPrice.id;
    subscription.pendingPriceSync = false;
    await subscription.save();

    if (previousPriceId && previousPriceId !== newPrice.id) {
      try {
        await stripe.prices.update(previousPriceId, { active: false });
      } catch (archiveError) {
        logger.warn(
          `[SubscriptionPriceReconciliation] Could not archive old Stripe price ${previousPriceId}: ${archiveError.message}`,
        );
      }
    }

    return {
      ok: true,
      action: "repaired",
      priceId: newPrice.id,
      expected,
    };
  } catch (error) {
    await persistPendingState(subscription, error);
    return {
      ok: false,
      action: "pending",
      pending: true,
      message: error?.message || "Stripe recurring price sync failed",
      expected,
    };
  }
}

/**
 * Reconcile a batch of subscriptions. Frequent automation should use
 * onlyPending=true; the daily integrity pass uses false so it also catches old
 * silent divergences created before this safety net existed.
 */
async function reconcileSubscriptionPrices({
  subscriptionId,
  onlyPending = true,
  limit = 100,
} = {}) {
  const filter = {
    status: { $in: ["active", "paused"] },
    isCancellationScheduled: { $ne: true },
    stripeSubscriptionId: { $nin: [null, ""] },
    stripeProductId: { $nin: [null, ""] },
  };
  if (subscriptionId) filter._id = subscriptionId;
  if (onlyPending && !subscriptionId) filter.pendingPriceSync = true;

  const subscriptions = await Subscription.find(filter).limit(
    Math.max(1, Math.min(Number(limit) || 100, 500)),
  );

  const summary = {
    checked: subscriptions.length,
    synced: 0,
    repaired: 0,
    pending: 0,
  };

  for (const subscription of subscriptions) {
    const result = await reconcileSubscriptionPrice(subscription);
    if (!result.ok) {
      summary.pending += 1;
    } else if (result.action === "repaired") {
      summary.repaired += 1;
    } else {
      summary.synced += 1;
    }
  }

  return summary;
}

module.exports = {
  reconcileSubscriptionPrice,
  reconcileSubscriptionPrices,
  resolveExpectedStripePrice,
};
