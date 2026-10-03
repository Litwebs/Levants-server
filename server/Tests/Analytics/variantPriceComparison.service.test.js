const analyticsService = require("../../services/analytics.admin.service");
const Variant = require("../../models/variant.model");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics variant price comparison", () => {
  test("compares historical realised price with current catalog price and preserves deleted variants", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Current Juice" });
    const activeVariant = await createVariant({ product, price: 20, stock: 100 });
    const deletedVariant = await createVariant({ product, price: 30, stock: 100 });

    await createOrder({
      customer,
      status: "paid",
      items: [{
        product: product._id,
        productName: "Historical Juice",
        variant: activeVariant._id,
        name: "Historical Active",
        sku: "PRICE-A-HIST",
        price: 20,
        quantity: 4,
        subtotal: 80,
      }],
      overrides: {
        subtotal: 80,
        discountAmount: 20,
        total: 60,
        paidAt: new Date("2026-06-10T12:00:00.000Z"),
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [{
        product: product._id,
        productName: "Historical Juice",
        variant: deletedVariant._id,
        name: "Historical Deleted",
        sku: "PRICE-D-HIST",
        price: 30,
        quantity: 1,
        subtotal: 30,
      }],
      overrides: {
        subtotal: 30,
        total: 30,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
      },
    });

    await Variant.updateOne(
      { _id: activeVariant._id },
      { $set: { name: "Renamed Active", sku: "PRICE-A-NOW", price: 25 } },
    );
    await Variant.deleteOne({ _id: deletedVariant._id });

    const result = await analyticsService.GetVariantPriceComparison({
      from: "2026-06-10",
      to: "2026-06-12",
      limit: 10,
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data.totals).toEqual({
      totalRevenue: 90,
      totalUnits: 5,
      realisedSellingPrice: 18,
      variantsSold: 2,
    });

    const rows = new Map(
      result.data.variants.map((row) => [String(row.variantId), row]),
    );

    expect(rows.get(String(activeVariant._id))).toEqual(
      expect.objectContaining({
        productName: "Historical Juice",
        variantName: "Historical Active",
        sku: "PRICE-A-HIST",
        catalogStatus: "active",
        totalRevenue: 60,
        totalUnits: 4,
        realisedSellingPrice: 15,
        currentPrice: 25,
        priceDifference: -10,
        priceDifferencePercent: -40,
      }),
    );

    expect(rows.get(String(deletedVariant._id))).toEqual(
      expect.objectContaining({
        variantName: "Historical Deleted",
        sku: "PRICE-D-HIST",
        catalogStatus: "deleted",
        totalRevenue: 30,
        totalUnits: 1,
        realisedSellingPrice: 30,
        currentPrice: null,
        priceDifference: null,
        priceDifferencePercent: null,
      }),
    );
  });
});
