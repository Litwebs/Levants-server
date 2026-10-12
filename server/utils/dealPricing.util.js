"use strict";

const PRICING_MODES = ["fixed_price", "fixed_saving", "percentage_saving"];

function calculateDealPricing(deal, originalValue) {
  const originalPence = Math.round(Number(originalValue) * 100);
  const pricingMode = deal.pricingMode || "fixed_price";
  const savingValue = Number(deal.savingValue);
  let pricePence;
  if (!Number.isSafeInteger(originalPence) || originalPence <= 0)
    return { success: false, message: "Deal products must have a positive combined value" };
  if (pricingMode === "fixed_price") pricePence = Math.round(Number(deal.packagePrice) * 100);
  else if (pricingMode === "fixed_saving") {
    if (!Number.isFinite(savingValue) || savingValue <= 0)
      return { success: false, message: "Enter a positive saving amount" };
    pricePence = originalPence - Math.round(savingValue * 100);
  } else if (pricingMode === "percentage_saving") {
    if (!Number.isFinite(savingValue) || savingValue <= 0 || savingValue >= 100)
      return { success: false, message: "Saving percentage must be greater than 0 and less than 100" };
    pricePence = Math.round(originalPence * (100 - savingValue) / 100);
  } else return { success: false, message: "Invalid deal pricing mode" };

  if (!Number.isSafeInteger(pricePence) || pricePence <= 0)
    return { success: false, message: "Package price must be greater than zero" };
  if (pricePence >= originalPence)
    return { success: false, message: "Package price must be lower than the current combined product value" };
  return { success: true, data: {
    pricingMode, savingValue: pricingMode === "fixed_price" ? null : savingValue,
    packagePrice: pricePence / 100, originalValue: originalPence / 100,
    savings: (originalPence - pricePence) / 100,
    savingsPercent: Math.round((originalPence - pricePence) / originalPence * 100),
  } };
}

// Old records and callers keep their existing published behaviour. New callers
// can explicitly create a private draft and publish through the lifecycle API.
function publishedDealFilter() {
  return { $or: [{ publicationStatus: "published" }, { publicationStatus: { $exists: false } }] };
}

module.exports = { PRICING_MODES, calculateDealPricing, publishedDealFilter };
