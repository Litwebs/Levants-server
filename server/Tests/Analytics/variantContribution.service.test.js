const analyticsService = require("../../services/analytics.admin.service");
const Variant = require("../../models/variant.model");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics variant contribution", () => {
  test("calculates contribution against all sold variants before applying the display limit", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Contribution Product" });
    const variantA = await createVariant({ product, price: 10, stock: 100 });
    const variantB = await createVariant({ product, price: 30, stock: 100 });

    await createOrder({
      customer,
      status: "paid",
      items: [
        {
          product: product._id,
          productName: "Historical Contribution Product",
          variant: variantA._id,
          name: "Historical A",
          sku: "CONTRIB-A",
          price: 10,
          quantity: 2,
          subtotal: 20,
        },
        {
          product: product._id,
          productName: "Historical Contribution Product",
          variant: variantB._id,
          name: "Historical B",
          sku: "CONTRIB-B",
          price: 30,
          quantity: 1,
          subtotal: 30,
        },
      ],
      overrides: {
        subtotal: 50,
        total: 50,
        paidAt: new Date("2026-06-10T12:00:00.000Z"),
      },
    });

    await Variant.deleteOne({ _id: variantB._id });

    const result = await analyticsService.GetVariantContribution({
      from: "2026-06-10",
      to: "2026-06-12",
      limit: 1,
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data.totals).toEqual({
      totalRevenue: 50,
      totalUnits: 3,
      variantsSold: 2,
    });

    expect(result.data.byRevenue).toEqual([
      expect.objectContaining({
        variantId: variantB._id,
        variantName: "Historical B",
        sku: "CONTRIB-B",
        catalogStatus: "deleted",
        totalRevenue: 30,
        totalUnits: 1,
        revenueContributionPercent: 60,
        unitContributionPercent: 33.33,
      }),
    ]);

    expect(result.data.byUnits).toEqual([
      expect.objectContaining({
        variantId: variantA._id,
        variantName: "Historical A",
        sku: "CONTRIB-A",
        totalRevenue: 20,
        totalUnits: 2,
        revenueContributionPercent: 40,
        unitContributionPercent: 66.67,
      }),
    ]);

    expect(result.data.variants).toEqual(result.data.byRevenue);
  });

  test("recalculates contribution inside the selected source filter", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Filtered Contribution" });
    const variantA = await createVariant({ product, price: 10, stock: 100 });
    const variantB = await createVariant({ product, price: 20, stock: 100 });

    await createOrder({
      customer,
      status: "paid",
      items: [{
        product: product._id,
        productName: "Filtered Contribution",
        variant: variantA._id,
        name: "Variant A",
        sku: "CONTRIB-SOURCE-A",
        price: 10,
        quantity: 2,
        subtotal: 20,
      }],
      overrides: {
        subtotal: 20,
        total: 20,
        paidAt: new Date("2026-06-10T12:00:00.000Z"),
        metadata: { manualImport: true },
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [{
        product: product._id,
        productName: "Filtered Contribution",
        variant: variantB._id,
        name: "Variant B",
        sku: "CONTRIB-SOURCE-B",
        price: 20,
        quantity: 1,
        subtotal: 20,
      }],
      overrides: {
        subtotal: 20,
        total: 20,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
      },
    });

    const imported = await analyticsService.GetVariantContribution({
      from: "2026-06-10",
      to: "2026-06-12",
      orderSource: "imported",
      timeZone: "Europe/London",
    });

    expect(imported.data.totals).toEqual({
      totalRevenue: 20,
      totalUnits: 2,
      variantsSold: 1,
    });
    expect(imported.data.byRevenue).toEqual([
      expect.objectContaining({
        variantId: variantA._id,
        revenueContributionPercent: 100,
        unitContributionPercent: 100,
      }),
    ]);
  });
});
