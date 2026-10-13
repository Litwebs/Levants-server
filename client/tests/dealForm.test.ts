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
