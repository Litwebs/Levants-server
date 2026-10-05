"use strict";

const plain = value => value?.toObject ? value.toObject() : value;
const comparable = items => JSON.stringify((items || []).map(item => ({
  variant: String(item.variant || item.variantId || ""),
  quantity: Number(item.quantity),
})).sort((a, b) => a.variant.localeCompare(b.variant)));

// A day removal must preserve the surviving day's live and staged quantities.
// Product edits use their own settlement flow and cannot be folded into removal.
function prepareSingleDayTransition(subscription, days, frequency, submittedPlans) {
  const previousDays = subscription.preferredDeliveryDays || [];
  if (subscription.frequency !== "weekly" || frequency !== "weekly" ||
      previousDays.length <= 1 || days.length !== 1) return null;
  const day = Number(days[0]);
  if (!previousDays.map(Number).includes(day)) {
    return { error: "Keep an existing delivery day when reducing to one day. Change its day separately." };
  }
  const selectItems = (plans, fallback) => {
    if (!plans?.length) return fallback;
    return plans.find(plan => Number(plan.day) === day)?.items;
  };
  const items = selectItems(subscription.deliveryDayPlans, subscription.items);
  const pending = plain(subscription.pendingChanges);
  const futureItems = selectItems(pending?.deliveryDayPlans, pending?.items?.length ? pending.items : items);
  if (!items?.length || !futureItems?.length) {
    return { error: "The remaining delivery day has no product plan. Please contact support." };
  }
  if (submittedPlans !== undefined && (!Array.isArray(submittedPlans) ||
      submittedPlans.length !== 1 || Number(submittedPlans[0].day) !== day ||
      comparable(submittedPlans[0].items) !== comparable(futureItems))) {
    return { error: "Save product changes separately before removing a delivery day." };
  }
  return {
    items: items.map(plain),
    pendingChanges: pending ? {
      ...pending,
      ...(pending.items?.length || pending.deliveryDayPlans?.length ? { items: futureItems.map(plain) } : {}),
      deliveryDayPlans: [],
      preferredDeliveryDay: day,
      preferredDeliveryDays: [day],
    } : undefined,
  };
}
module.exports = { prepareSingleDayTransition };
