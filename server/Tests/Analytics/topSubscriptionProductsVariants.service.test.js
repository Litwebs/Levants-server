const mongoose = require("mongoose");
const analyticsService = require("../../services/analytics.admin.service");
const Variant = require("../../models/variant.model");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics top subscription products and variants", () => {
  test("ranks subscription merchandise with full-period contribution denominators", async () => {
    const customer = await createCustomer();
    const productA = await createProduct({ name: "Current Product A" });
    const productB = await createProduct({ name: "Current Product B" });
    const variantA = await createVariant({ product: productA, price: 15, stock: 100 });
    const variantB = await createVariant({ product: productB, price: 10, stock: 100 });

    await createOrder({
      customer,
      status: "paid",
      items: [
        {
          product: productA._id,
          productName: "Historical Product A",
          variant: variantA._id,
          name: "Historical Variant A",
          sku: "SUB-TOP-A",
          price: 15,
          quantity: 1,
          subtotal: 15,
        },
        {
          product: productA._id,
          productName: "Historical Product A",
          variant: variantA._id,
          name: "Historical Variant A",
          sku: "SUB-TOP-A",
          price: 15,
          quantity: 1,
          subtotal: 15,
        },
      ],
      overrides: {
        subtotal: 30,
        total: 30,
        paidAt: new Date("2026-06-10T12:00:00.000Z"),
        orderType: "subscription_generated",
        subscription: new mongoose.Types.ObjectId(),
      },
    });

    await createOrder({
      customer,
      status: "partially_paid",
      items: [{
        product: productB._id,
        productName: "Historical Product B",
        variant: variantB._id,
        name: "Historical Variant B",
        sku: "SUB-TOP-B",
        price: 10,
        quantity: 4,
        subtotal: 40,
      }],
      overrides: {
        subtotal: 40,
        total: 40,
        amountPaid: 20,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
        subscription: new mongoose.Types.ObjectId(),
      },
    });

    // Website and imported/manual sales must not enter the Subscription ranking.
    await createOrder({
      customer,
      status: "paid",
      items: [{
        product: productB._id,
        productName: "Historical Product B",
        variant: variantB._id,
        name: "Historical Variant B",
        sku: "SUB-TOP-B",
        price: 10,
        quantity: 10,
        subtotal: 100,
      }],
      overrides: {
        subtotal: 100,
        total: 100,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
      },
    });
    await createOrder({
      customer,
      status: "paid",
      items: [{
        product: productB._id,
        productName: "Historical Product B",
        variant: variantB._id,
        name: "Historical Variant B",
        sku: "SUB-TOP-B",
        price: 10,
        quantity: 10,
        subtotal: 100,
      }],
      overrides: {
        subtotal: 100,
        total: 100,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
        metadata: { manualImport: true },
        orderType: "subscription_generated",
        subscription: new mongoose.Types.ObjectId(),
      },
    });

    productA.name = "Renamed Current Product A";
    await productA.save();
    await Variant.deleteOne({ _id: variantA._id });

    const result = await analyticsService.GetTopSubscriptionProductsVariants({
      from: "2026-06-10",
      to: "2026-06-12",
      limit: 1,
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data.products.totals).toEqual({
      totalRevenue: 50,
      totalUnits: 6,
      productsSold: 2,
    });
    expect(result.data.variants.totals).toEqual({
      totalRevenue: 50,
      totalUnits: 6,
      variantsSold: 2,
    });

    expect(result.data.products.byRevenue).toEqual([
      expect.objectContaining({
        productId: productA._id,
        productName: "Historical Product A",
        totalRevenue: 30,
        totalUnits: 2,
        orderCount: 1,
        revenueContributionPercent: 60,
        unitContributionPercent: 33.33,
      }),
    ]);
    expect(result.data.products.byUnits).toEqual([
      expect.objectContaining({
        productId: productB._id,
        productName: "Historical Product B",
        totalRevenue: 20,
        totalUnits: 4,
        orderCount: 1,
        revenueContributionPercent: 40,
        unitContributionPercent: 66.67,
      }),
    ]);

    expect(result.data.variants.byRevenue).toEqual([
      expect.objectContaining({
        variantId: variantA._id,
        productName: "Historical Product A",
        variantName: "Historical Variant A",
        sku: "SUB-TOP-A",
        catalogStatus: "deleted",
        totalRevenue: 30,
        totalUnits: 2,
        orderCount: 1,
        revenueContributionPercent: 60,
        unitContributionPercent: 33.33,
      }),
    ]);
    expect(result.data.variants.byUnits).toEqual([
      expect.objectContaining({
        variantId: variantB._id,
        productName: "Historical Product B",
        variantName: "Historical Variant B",
        sku: "SUB-TOP-B",
        totalRevenue: 20,
        totalUnits: 4,
        orderCount: 1,
        revenueContributionPercent: 40,
        unitContributionPercent: 66.67,
      }),
    ]);
  });

  test("returns stable empty ranking structures", async () => {
    const result = await analyticsService.GetTopSubscriptionProductsVariants({
      from: "2026-01-01",
      to: "2026-01-02",
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      products: {
        byRevenue: [],
        byUnits: [],
        totals: { totalRevenue: 0, totalUnits: 0, productsSold: 0 },
      },
      variants: {
        byRevenue: [],
        byUnits: [],
        totals: { totalRevenue: 0, totalUnits: 0, variantsSold: 0 },
      },
      metricBasis: expect.objectContaining({
        revenue: expect.any(String),
        units: expect.any(String),
        ranking: expect.any(String),
        identity: expect.any(String),
        source: expect.any(String),
      }),
    });
  });
});
