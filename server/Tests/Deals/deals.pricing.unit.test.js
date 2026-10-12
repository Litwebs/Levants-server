const { calculateDealPricing } = require("../../utils/dealPricing.util");

describe("Deals / defined savings pricing", () => {
  test.each([
    ["fixed_price", 11.5, null, 11.5, 3.25],
    ["fixed_saving", null, 3, 11.75, 3],
    ["percentage_saving", null, 20, 11.8, 2.95],
    ["percentage_saving", null, 33.33, 9.83, 4.92],
  ])("%s calculates preview and checkout in pennies", (pricingMode, packagePrice, savingValue, expectedPrice, expectedSaving) => {
    expect(calculateDealPricing({ pricingMode, packagePrice, savingValue }, 14.75)).toMatchObject({ success: true, data: { packagePrice: expectedPrice, savings: expectedSaving, originalValue: 14.75 } });
  });
  test.each([
    [{ pricingMode: "fixed_saving", savingValue: 14.75 }, 14.75],
    [{ pricingMode: "fixed_saving", savingValue: 20 }, 14.75],
    [{ pricingMode: "percentage_saving", savingValue: 100 }, 10],
    [{ pricingMode: "percentage_saving", savingValue: -1 }, 10],
    [{ pricingMode: "percentage_saving", savingValue: 0.01 }, 0.01],
    [{ pricingMode: "fixed_price", packagePrice: 10 }, 10],
    [{ pricingMode: "fixed_price", packagePrice: 0 }, 10],
    [{ pricingMode: "invalid", savingValue: 20 }, 10],
    [{ pricingMode: "fixed_price", packagePrice: 2 }, 0],
  ])("invalid effective price is rejected: %j", (deal, originalValue) => {
    expect(calculateDealPricing(deal, originalValue).success).toBe(false);
  });
  test("legacy price mode remains fixed while defined savings follow retail prices", () => {
    expect(calculateDealPricing({ packagePrice: 8 }, 12).data.packagePrice).toBe(8);
    expect(calculateDealPricing({ pricingMode: "fixed_saving", savingValue: 2 }, 12).data.packagePrice).toBe(10);
    expect(calculateDealPricing({ pricingMode: "percentage_saving", savingValue: 20 }, 12).data.packagePrice).toBe(9.6);
  });
});
