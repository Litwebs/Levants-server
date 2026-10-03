"use strict";

/**
 * A recurring edit reduces the delivery's value immediately, but a store-credit
 * settlement does not reverse its card capture (amountPaid). Returning the full
 * capture again would repay the decrease twice. Terminal settlements therefore
 * cannot exceed either the remaining paid amount or the current delivery value.
 * The latter includes retained paid add-ons and the delivery fee. Card refunds
 * already reduce amountPaid, so do not subtract the refund history a second time.
 */
function remainingSubscriptionOrderValueMinor(order) {
  const paidMinor = Math.round(Number(order.amountPaid ?? order.total ?? 0) * 100);
  const valueMinor = Math.round(Number(order.total ?? order.amountPaid ?? 0) * 100);
  if (!Number.isFinite(paidMinor) || !Number.isFinite(valueMinor)) return 0;
  return Math.max(0, Math.min(paidMinor, valueMinor));
}

module.exports = { remainingSubscriptionOrderValueMinor };
