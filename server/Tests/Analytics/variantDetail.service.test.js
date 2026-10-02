const analyticsService = require("../../services/analytics.admin.service");
const Variant = require("../../models/variant.model");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics variant detail", () => {
  test("returns historical detail, source split, contribution and zero-filled trends", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Current Detail Product" });
    const variant = await createVariant({ product, price: 12, stock: 100 });
    const otherVariant = await createVariant({ product, price: 20, stock: 100 });

    await createOrder({
      customer,
      status: "paid",
      items: [
        {
          product: product._id,
          productName: "Historical Detail Product",
          variant: variant._id,
          name: "Historical Detail Variant",
          sku: "DETAIL-HIST",
          price: 10,
          quantity: 1,
          subtotal: 10,
        },
        {
          product: product._id,
          productName: "Historical Detail Product",
          variant: variant._id,
          name: "Historical Detail Variant",
          sku: "DETAIL-HIST",
          price: 10,
          quantity: 1,
          subtotal: 10,
        },
        {
          product: product._id,
          productName: "Historical Detail Product",
          variant: otherVariant._id,
          name: "Other Variant",
          sku: "DETAIL-OTHER",
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
      items: [{
        product: product._id,
        productName: "Historical Detail Product",
        variant: variant._id,
        name: "Historical Detail Variant",
        sku: "DETAIL-HIST",
        price: 10,
        quantity: 2,
        subtotal: 20,
      }],
      overrides: {
        subtotal: 20,
        total: 20,
        amountPaid: 10,
        paidAt: new Date("2026-06-12T12:00:00.000Z"),
        metadata: { manualImport: true },
      },
    });

    await Variant.updateOne(
      { _id: variant._id },
      { $set: { name: "Renamed Current Variant", sku: "DETAIL-NOW", price: 15 } },
    );

    const activeResult = await analyticsService.GetVariantDetail({
      variantId: String(variant._id),
      from: "2026-06-10",
      to: "2026-06-12",
      interval: "day",
      timeZone: "Europe/London",
    });
    expect(activeResult.data).toEqual(
      expect.objectContaining({
        variantName: "Historical Detail Variant",
        sku: "DETAIL-HIST",
        catalogStatus: "active",
        currentPrice: 15,
        realisedSellingPrice: 7.5,
        priceDifference: -7.5,
        priceDifferencePercent: -50,
      }),
    );

    await Variant.deleteOne({ _id: variant._id });

    const result = await analyticsService.GetVariantDetail({
      variantId: String(variant._id),
      from: "2026-06-10",
      to: "2026-06-12",
      interval: "day",
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        productId: product._id,
        variantId: variant._id,
        productName: "Historical Detail Product",
        variantName: "Historical Detail Variant",
        sku: "DETAIL-HIST",
        catalogStatus: "deleted",
        currentPrice: null,
        totalRevenue: 30,
        totalUnits: 4,
        totalOrders: 2,
        realisedSellingPrice: 7.5,
        averageRevenuePerOrder: 15,
        averageUnitsPerOrder: 2,
        revenueContributionPercent: 60,
        unitContributionPercent: 80,
        priceDifference: null,
        priceDifferencePercent: null,
      }),
    );

    const sources = new Map(
      result.data.sourceSplit.map((source) => [source.key, source]),
    );
    expect(sources.get("website")).toEqual(
      expect.objectContaining({
        revenue: 20,
        units: 2,
        orders: 1,
        realisedSellingPrice: 10,
        revenueContributionPercent: 66.67,
        unitContributionPercent: 50,
      }),
    );
    expect(sources.get("imported")).toEqual(
      expect.objectContaining({
        revenue: 10,
        units: 2,
        orders: 1,
        realisedSellingPrice: 5,
        revenueContributionPercent: 33.33,
        unitContributionPercent: 50,
      }),
    );
    expect(sources.get("subscription")).toEqual(
      expect.objectContaining({
        revenue: 0,
        units: 0,
        orders: 0,
        realisedSellingPrice: 0,
      }),
    );

    expect(result.data.trend).toEqual({
      interval: "day",
      points: [
        {
          label: "2026-06-10",
          revenue: 20,
          units: 2,
          orders: 1,
          realisedSellingPrice: 10,
        },
        {
          label: "2026-06-11",
          revenue: 0,
          units: 0,
          orders: 0,
          realisedSellingPrice: 0,
        },
        {
          label: "2026-06-12",
          revenue: 10,
          units: 2,
          orders: 1,
          realisedSellingPrice: 5,
        },
      ],
    });

    const imported = await analyticsService.GetVariantDetail({
      variantId: String(variant._id),
      from: "2026-06-10",
      to: "2026-06-12",
      interval: "day",
      orderSource: "imported",
      timeZone: "Europe/London",
    });
    expect(imported.data).toEqual(
      expect.objectContaining({
        totalRevenue: 10,
        totalUnits: 2,
        totalOrders: 1,
        revenueContributionPercent: 100,
        unitContributionPercent: 100,
      }),
    );

    const emptyLaterPeriod = await analyticsService.GetVariantDetail({
      variantId: String(variant._id),
      from: "2026-07-01",
      to: "2026-07-03",
      interval: "day",
      timeZone: "Europe/London",
    });
    expect(emptyLaterPeriod.success).toBe(true);
    expect(emptyLaterPeriod.data).toEqual(
      expect.objectContaining({
        productName: "Historical Detail Product",
        variantName: "Historical Detail Variant",
        sku: "DETAIL-HIST",
        catalogStatus: "deleted",
        currentPrice: null,
        totalRevenue: 0,
        totalUnits: 0,
        totalOrders: 0,
        revenueContributionPercent: 0,
        unitContributionPercent: 0,
      }),
    );
  });

  test("returns stable zero-valued detail for a current variant with no selected-period sales", async () => {
    const product = await createProduct({ name: "Current Empty Product" });
    const variant = await createVariant({ product, price: 12, stock: 100 });

    const result = await analyticsService.GetVariantDetail({
      variantId: String(variant._id),
      from: "2026-06-10",
      to: "2026-06-12",
      interval: "day",
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        productId: product._id,
        variantId: variant._id,
        productName: "Current Empty Product",
        variantName: variant.name,
        sku: variant.sku,
        catalogStatus: "active",
        currentPrice: 12,
        totalRevenue: 0,
        totalUnits: 0,
        totalOrders: 0,
        realisedSellingPrice: 0,
        priceDifference: null,
        priceDifferencePercent: null,
      }),
    );
    expect(result.data.sourceSplit).toHaveLength(3);
    expect(result.data.trend.points).toHaveLength(3);
    expect(result.data.trend.points.every((point) => point.revenue === 0)).toBe(
      true,
    );
  });

  test("validates ids, missing variants and service-level bucket limits", async () => {
    const invalid = await analyticsService.GetVariantDetail({
      variantId: "not-an-object-id",
      range: "today",
      interval: "day",
    });
    expect(invalid).toEqual(
      expect.objectContaining({ success: false, statusCode: 400 }),
    );

    const missing = await analyticsService.GetVariantDetail({
      variantId: "507f1f77bcf86cd799439011",
      range: "today",
      interval: "day",
    });
    expect(missing).toEqual(
      expect.objectContaining({ success: false, statusCode: 404 }),
    );

    const product = await createProduct({ name: "Bounded Variant Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

    const excessive = await analyticsService.GetVariantDetail({
      variantId: String(variant._id),
      from: "2020-01-01",
      to: "2026-01-01",
      interval: "day",
      timeZone: "Europe/London",
    });
    expect(excessive).toEqual(
      expect.objectContaining({ success: false, statusCode: 400 }),
    );
    expect(excessive.message).toContain("maximum is 1000");

    const allTimeDaily = await analyticsService.GetVariantDetail({
      variantId: String(variant._id),
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
