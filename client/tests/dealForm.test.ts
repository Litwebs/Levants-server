import { describe, expect, test } from "vitest";
import { createEmptyDealDraft, dealTotals, selectedItemFromVariant, slugifyDealName, poundsToPence } from "@/pages/Deals/dealForm";

describe("Deals / price preview", () => {
  test("mixed package totals use pennies and include every component quantity", () => {
    const items = [
      { variantId: "milk", variantName: "Milk", productName: "Dairy", sku: "M", pricePence: 325, quantity: 2 },
      { variantId: "eggs", variantName: "Eggs", productName: "Eggs", sku: "E", pricePence: 275, quantity: 3 },
    ];
    expect(dealTotals(items, "11.50")).toEqual({ uniqueVariants: 2, totalUnits: 5, originalValuePence: 1475, packagePricePence: 1150, savingsPence: 325, discountPercent: 22 });
  });
  test.each(["14.75", "20"])("price %s never previews a negative saving", price => {
    expect(dealTotals([{ variantId: "m", variantName: "Milk", productName: "Dairy", sku: "M", pricePence: 1475, quantity: 1 }], price).savingsPence).toBe(0);
  });
  test("empty package has zero totals without invalid percentage values", () => {
    expect(dealTotals([], "")).toMatchObject({ originalValuePence: 0, savingsPence: 0, discountPercent: 0 });
  });
  test.each([["3.25", 325], ["0.01", 1], ["invalid", 0]])("price input %s converts safely to pennies", (input, expected) => {
    expect(poundsToPence(input)).toBe(expected);
  });
  test("selecting a variant preserves stock and promotional image fallback", () => {
    const item = selectedItemFromVariant({ _id: "v1", name: "Milk", sku: "M", price: 3.25, availableQuantity: 4, status: "active", product: { _id: "p1", name: "Dairy", thumbnailImage: { url: "https://example.com/product.jpg" } } });
    expect(item).toMatchObject({ variantId: "v1", quantity: 1, pricePence: 325, availableQuantity: 4, imageUrl: "https://example.com/product.jpg" });
  });
  test("new drafts have no schedule and independent mutable fields", () => {
    const first = createEmptyDealDraft(); first.name = "Changed";
    expect(createEmptyDealDraft()).toMatchObject({ name: "", startsAt: "", endsAt: "", isActive: true, isFeatured: false });
  });
  test("slugs normalise spaces, punctuation and ampersands", () => {
    expect(slugifyDealName("  Milk & Eggs!  ")).toBe("milk-and-eggs");
  });
});

describe("savings pricing matches server penny rounding", () => {
  const items = [{ variantId: "v1", variantName: "Milk", productName: "Milk", sku: "MILK", pricePence: 333, quantity: 3 }];
  test("fixed saving is deducted from current value", () => {
    expect(dealTotals(items, "1", "fixed_saving", "2").packagePricePence).toBe(799);
  });
  test("percentage savings round the final package price", () => {
    expect(dealTotals(items, "1", "percentage_saving", "12.5").packagePricePence).toBe(874);
  });
  test("changing quantities recomputes prices", () => {
    expect(dealTotals([{ ...items[0], quantity: 2 }], "1", "percentage_saving", "20").packagePricePence).toBe(533);
  });
});
