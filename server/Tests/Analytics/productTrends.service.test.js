const analyticsService = require("../../services/analytics.admin.service");
const Product = require("../../models/product.model");
const Variant = require("../../models/variant.model");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics product trends", () => {
  test("ranks historical products by revenue and zero-fills aligned daily buckets", async () => {
    const customer = await createCustomer();
    const productA = await createProduct({ name: "Current A" });
    const variantA = await createVariant({ product: productA, price: 10, stock: 100 });
    const productB = await createProduct({ name: "Current B" });
    const variantB = await createVariant({ product: productB, price: 20, stock: 100 });
    const productC = await createProduct({ name: "Current C" });
    const variantC = await createVariant({ product: productC, price: 5, stock: 100 });

    await createOrder({
      customer,
      status: "paid",
      items: [{
        product: productA._id,
        productName: "Historical A",
        variant: variantA._id,
        name: "A",
        sku: "A-TREND",
        price: 10,
        quantity: 2,
        subtotal: 20,
      }],
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
        product: productB._id,
        productName: "Historical B",
        variant: variantB._id,
        name: "B",
        sku: "B-TREND",
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
      items: [{
        product: productA._id,
        productName: "Historical A",
        variant: variantA._id,
        name: "A",
        sku: "A-TREND",
        price: 10,
        quantity: 1,
        subtotal: 10,
      }],
      overrides: {
        subtotal: 10,
        total: 10,
        paidAt: new Date("2026-06-12T12:00:00.000Z"),
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [{
        product: productC._id,
        productName: "Historical C",
        variant: variantC._id,
        name: "C",
        sku: "C-TREND",
        price: 5,
        quantity: 1,
        subtotal: 5,
      }],
      overrides: {
        subtotal: 5,
        total: 5,
        paidAt: new Date("2026-06-12T12:00:00.000Z"),
      },
    });

    await Variant.deleteOne({ _id: variantB._id });
    await Product.deleteOne({ _id: productB._id });

    const result = await analyticsService.GetProductTrends({
      from: "2026-06-10",
      to: "2026-06-12",
      interval: "day",
      limit: 2,
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data.interval).toBe("day");
    expect(result.data.products.map((row) => String(row.productId))).toEqual([
      String(productA._id),
      String(productB._id),
    ]);

    const [a, b] = result.data.products;
    expect(a).toEqual(
      expect.objectContaining({
        productName: "Historical A",
        catalogStatus: "active",
        totalRevenue: 30,
        totalUnits: 3,
        totalOrders: 2,
        averageSellingPrice: 10,
      }),
    );
    expect(a.points).toEqual([
      {
        label: "2026-06-10",
        revenue: 20,
        units: 2,
        orders: 1,
        averageSellingPrice: 10,
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
        units: 1,
        orders: 1,
        averageSellingPrice: 10,
      },
    ]);

    expect(b).toEqual(
      expect.objectContaining({
        productName: "Historical B",
        catalogStatus: "deleted",
        totalRevenue: 30,
        totalUnits: 3,
        totalOrders: 1,
        averageSellingPrice: 10,
      }),
    );
    expect(b.points[0]).toEqual(
      expect.objectContaining({
        label: "2026-06-10",
        revenue: 0,
        units: 0,
      }),
    );
    expect(b.points[1]).toEqual({
      label: "2026-06-11",
      revenue: 30,
      units: 3,
      orders: 1,
      averageSellingPrice: 10,
    });
    expect(b.points[2]).toEqual(
      expect.objectContaining({
        label: "2026-06-12",
        revenue: 0,
        units: 0,
      }),
    );
  });

  test("source filtering and service bucket limits apply to product trends", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Imported Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

    await createOrder({
      customer,
      status: "paid",
      items: [{
        product: product._id,
        productName: "Imported Product",
        variant: variant._id,
        name: "Imported",
        sku: "IMPORTED-TREND",
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

    const imported = await analyticsService.GetProductTrends({
      from: "2026-06-10",
      to: "2026-06-12",
      interval: "day",
      orderSource: "imported",
      timeZone: "Europe/London",
    });
    const website = await analyticsService.GetProductTrends({
      from: "2026-06-10",
      to: "2026-06-12",
      interval: "day",
      orderSource: "website",
      timeZone: "Europe/London",
    });

    expect(imported.data.products).toHaveLength(1);
    expect(imported.data.products[0].totalRevenue).toBe(20);
    expect(website.data.products).toEqual([]);

    const excessive = await analyticsService.GetProductTrends({
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

    const allTimeDaily = await analyticsService.GetProductTrends({
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
