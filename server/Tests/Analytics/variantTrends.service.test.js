const analyticsService = require("../../services/analytics.admin.service");
const Variant = require("../../models/variant.model");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics variant trends", () => {
  test("ranks historical variants by revenue and zero-fills aligned daily buckets", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Current Trend Product" });
    const variantA = await createVariant({ product, price: 10, stock: 100 });
    const variantB = await createVariant({ product, price: 20, stock: 100 });
    const variantC = await createVariant({ product, price: 5, stock: 100 });

    await createOrder({
      customer,
      status: "paid",
      items: [
        {
          product: product._id,
          productName: "Historical Trend Product",
          variant: variantA._id,
          name: "Historical A",
          sku: "VAR-A-TREND",
          price: 10,
          quantity: 1,
          subtotal: 10,
        },
        {
          product: product._id,
          productName: "Historical Trend Product",
          variant: variantA._id,
          name: "Historical A",
          sku: "VAR-A-TREND",
          price: 10,
          quantity: 1,
          subtotal: 10,
        },
      ],
      overrides: {
        subtotal: 20,
        total: 20,
        paidAt: new Date("2026-06-10T12:00:00.000Z"),
      },
    });

    await createOrder({
      customer,
      status: "partially_paid",
      items: [{
        product: product._id,
        productName: "Historical Trend Product",
        variant: variantB._id,
        name: "Historical B",
        sku: "VAR-B-TREND",
        price: 20,
        quantity: 3,
        subtotal: 60,
      }],
      overrides: {
        subtotal: 60,
        total: 60,
        amountPaid: 30,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [
        {
          product: product._id,
          productName: "Historical Trend Product",
          variant: variantA._id,
          name: "Historical A",
          sku: "VAR-A-TREND",
          price: 10,
          quantity: 1,
          subtotal: 10,
        },
        {
          product: product._id,
          productName: "Historical Trend Product",
          variant: variantC._id,
          name: "Historical C",
          sku: "VAR-C-TREND",
          price: 5,
          quantity: 1,
          subtotal: 5,
        },
      ],
      overrides: {
        subtotal: 15,
        total: 15,
        paidAt: new Date("2026-06-12T12:00:00.000Z"),
      },
    });

    await Variant.updateOne(
      { _id: variantA._id },
      { $set: { name: "Renamed A", sku: "VAR-A-NOW" } },
    );
    await Variant.deleteOne({ _id: variantB._id });

    const result = await analyticsService.GetVariantTrends({
      from: "2026-06-10",
      to: "2026-06-12",
      interval: "day",
      limit: 2,
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data.interval).toBe("day");
    expect(result.data.variants.map((row) => String(row.variantId))).toEqual([
      String(variantA._id),
      String(variantB._id),
    ]);

    const [a, b] = result.data.variants;
    expect(a).toEqual(
      expect.objectContaining({
        productName: "Historical Trend Product",
        variantName: "Historical A",
        sku: "VAR-A-TREND",
        catalogStatus: "active",
        totalRevenue: 30,
        totalUnits: 3,
        totalOrders: 2,
        realisedSellingPrice: 10,
      }),
    );
    expect(a.points).toEqual([
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
        units: 1,
        orders: 1,
        realisedSellingPrice: 10,
      },
    ]);

    expect(b).toEqual(
      expect.objectContaining({
        productName: "Historical Trend Product",
        variantName: "Historical B",
        sku: "VAR-B-TREND",
        catalogStatus: "deleted",
        totalRevenue: 30,
        totalUnits: 3,
        totalOrders: 1,
        realisedSellingPrice: 10,
      }),
    );
    expect(b.points[1]).toEqual({
      label: "2026-06-11",
      revenue: 30,
      units: 3,
      orders: 1,
      realisedSellingPrice: 10,
    });
  });

  test("source filtering and service bucket limits apply to variant trends", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Imported Variant Trends" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

    await createOrder({
      customer,
      status: "paid",
      items: [{
        product: product._id,
        productName: "Imported Variant Trends",
        variant: variant._id,
        name: "Imported Historical",
        sku: "VAR-IMPORTED-TREND",
        price: 10,
        quantity: 2,
        subtotal: 20,
      }],
      overrides: {
        subtotal: 20,
        total: 20,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
        metadata: { manualImport: true },
      },
    });

    const imported = await analyticsService.GetVariantTrends({
      from: "2026-06-10",
      to: "2026-06-12",
      interval: "day",
      orderSource: "imported",
      timeZone: "Europe/London",
    });
    const website = await analyticsService.GetVariantTrends({
      from: "2026-06-10",
      to: "2026-06-12",
      interval: "day",
      orderSource: "website",
      timeZone: "Europe/London",
    });

    expect(imported.data.variants).toHaveLength(1);
    expect(imported.data.variants[0]).toEqual(
      expect.objectContaining({
        totalRevenue: 20,
        totalUnits: 2,
      }),
    );
    expect(website.data.variants).toEqual([]);

    const excessive = await analyticsService.GetVariantTrends({
      from: "2020-01-01",
      to: "2026-01-01",
      interval: "day",
      timeZone: "Europe/London",
    });
    expect(excessive).toEqual(
      expect.objectContaining({
        success: false,
        statusCode: 400,
      }),
    );
    expect(excessive.message).toContain("maximum is 1000");

    const allTimeDaily = await analyticsService.GetVariantTrends({
      range: "all",
      interval: "day",
      timeZone: "Europe/London",
    });
    expect(allTimeDaily).toEqual(
      expect.objectContaining({
        success: false,
        statusCode: 400,
      }),
    );
    expect(allTimeDaily.message).toContain("monthly or yearly");
  });
});
