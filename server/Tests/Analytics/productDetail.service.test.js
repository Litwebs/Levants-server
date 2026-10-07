const analyticsService = require("../../services/analytics.admin.service");
const Product = require("../../models/product.model");
const Variant = require("../../models/variant.model");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics product detail", () => {
  test("returns historical detail, sources, variants, contribution and zero-filled trends", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Current Juice" });
    const variantA = await createVariant({ product, price: 10, stock: 100 });
    const variantB = await createVariant({ product, price: 20, stock: 100 });
    const otherProduct = await createProduct({ name: "Other Product" });
    const otherVariant = await createVariant({
      product: otherProduct,
      price: 40,
      stock: 100,
    });

    await createOrder({
      customer,
      status: "paid",
      items: [
        {
          product: product._id,
          productName: "Historical Juice",
          variant: variantA._id,
          name: "Small Bottle",
          sku: "JUICE-S",
          price: 10,
          quantity: 2,
          subtotal: 20,
        },
        {
          product: product._id,
          productName: "Historical Juice",
          variant: variantB._id,
          name: "Large Bottle",
          sku: "JUICE-L",
          price: 20,
          quantity: 1,
          subtotal: 20,
        },
      ],
      overrides: {
        subtotal: 40,
        total: 40,
        paidAt: new Date("2026-06-10T12:00:00.000Z"),
      },
    });

    await createOrder({
      customer,
      status: "partially_paid",
      items: [
        {
          product: product._id,
          productName: "Historical Juice",
          variant: variantA._id,
          name: "Small Bottle",
          sku: "JUICE-S",
          price: 10,
          quantity: 2,
          subtotal: 20,
        },
      ],
      overrides: {
        subtotal: 20,
        total: 20,
        amountPaid: 10,
        paidAt: new Date("2026-06-12T12:00:00.000Z"),
        metadata: { manualImport: true },
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [
        {
          product: otherProduct._id,
          productName: "Other Product",
          variant: otherVariant._id,
          name: "Other",
          sku: "OTHER",
          price: 40,
          quantity: 1,
          subtotal: 40,
        },
      ],
      overrides: {
        subtotal: 40,
        total: 40,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
      },
    });

    await Variant.deleteOne({ _id: variantA._id });
    await Variant.deleteOne({ _id: variantB._id });
    await Product.deleteOne({ _id: product._id });

    const result = await analyticsService.GetProductDetail({
      productId: String(product._id),
      from: "2026-06-10",
      to: "2026-06-12",
      interval: "day",
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        productName: "Historical Juice",
        catalogStatus: "deleted",
        totalRevenue: 50,
        totalUnits: 5,
        totalOrders: 2,
        averageSellingPrice: 10,
        averageRevenuePerOrder: 25,
        averageUnitsPerOrder: 2.5,
        revenueContributionPercent: 55.56,
        unitContributionPercent: 83.33,
      }),
    );

    expect(result.data.variants).toEqual([
      expect.objectContaining({
        name: "Small Bottle",
        sku: "JUICE-S",
        revenue: 30,
        quantity: 4,
        orderCount: 2,
        averageSellingPrice: 7.5,
        revenueContributionPercent: 60,
        unitContributionPercent: 80,
      }),
      expect.objectContaining({
        name: "Large Bottle",
        sku: "JUICE-L",
        revenue: 20,
        quantity: 1,
        orderCount: 1,
        averageSellingPrice: 20,
        revenueContributionPercent: 40,
        unitContributionPercent: 20,
      }),
    ]);

    const sources = new Map(
      result.data.sourceSplit.map((source) => [source.key, source]),
    );
    expect(sources.get("website")).toEqual(
      expect.objectContaining({
        revenue: 40,
        units: 3,
        orders: 1,
        revenueContributionPercent: 80,
      }),
    );
    expect(sources.get("imported")).toEqual(
      expect.objectContaining({
        revenue: 10,
        units: 2,
        orders: 1,
        revenueContributionPercent: 20,
      }),
    );
    expect(sources.get("subscription")).toEqual(
      expect.objectContaining({ revenue: 0, units: 0, orders: 0 }),
    );

    expect(result.data.trend).toEqual({
      interval: "day",
      points: [
        {
          label: "2026-06-10",
          revenue: 40,
          units: 3,
          orders: 1,
          averageSellingPrice: 40 / 3,
        },
        {
          label: "2026-06-11",
          revenue: 0,
          units: 0,
          orders: 0,
          averageSellingPrice: 0,
        },
        {
          label: "2026-06-12",
          revenue: 10,
          units: 2,
          orders: 1,
          averageSellingPrice: 5,
        },
      ],
    });
  });

  test("returns a stable zero-valued empty period for a current product", async () => {
    const product = await createProduct({ name: "No Sales Product" });

    const result = await analyticsService.GetProductDetail({
      productId: String(product._id),
      from: "2026-06-10",
      to: "2026-06-12",
      interval: "day",
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        productName: "No Sales Product",
        catalogStatus: "active",
        totalRevenue: 0,
        totalUnits: 0,
        totalOrders: 0,
        variants: [],
      }),
    );
    expect(result.data.sourceSplit).toHaveLength(3);
    expect(result.data.trend.points).toHaveLength(3);
    expect(result.data.trend.points.every((point) => point.revenue === 0)).toBe(
      true,
    );
  });

  test("validates ids, missing products and service-level bucket limits", async () => {
    const invalid = await analyticsService.GetProductDetail({
      productId: "not-an-object-id",
      range: "today",
      interval: "day",
    });
    expect(invalid).toEqual(
      expect.objectContaining({ success: false, statusCode: 400 }),
    );

    const missing = await analyticsService.GetProductDetail({
      productId: "507f1f77bcf86cd799439011",
      range: "today",
      interval: "day",
    });
    expect(missing).toEqual(
      expect.objectContaining({ success: false, statusCode: 404 }),
    );

    const product = await createProduct({ name: "Bounded Product" });
    const excessive = await analyticsService.GetProductDetail({
      productId: String(product._id),
      from: "2020-01-01",
      to: "2026-01-01",
      interval: "day",
      timeZone: "Europe/London",
    });
    expect(excessive).toEqual(
      expect.objectContaining({ success: false, statusCode: 400 }),
    );
    expect(excessive.message).toContain("maximum is 1000");

    const allTimeDaily = await analyticsService.GetProductDetail({
      productId: String(product._id),
      range: "all",
      interval: "day",
      timeZone: "Europe/London",
    });
    expect(allTimeDaily).toEqual(
      expect.objectContaining({ success: false, statusCode: 400 }),
    );
    expect(allTimeDaily.message).toContain("monthly or yearly");
  });
});
