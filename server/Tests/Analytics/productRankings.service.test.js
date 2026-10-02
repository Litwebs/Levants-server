const analyticsService = require("../../services/analytics.admin.service");
const Product = require("../../models/product.model");
const Variant = require("../../models/variant.model");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics historical product rankings", () => {
  test("ranks by revenue and units without depending on live catalog rows", async () => {
    const customer = await createCustomer();

    const productA = await createProduct({ name: "Current Apples" });
    const variantA = await createVariant({ product: productA, price: 2, stock: 100 });

    const productB = await createProduct({ name: "Current Hamper" });
    const variantB = await createVariant({ product: productB, price: 100, stock: 100 });

    const productLegacy = await createProduct({ name: "Legacy Product" });
    const variantLegacy = await createVariant({
      product: productLegacy,
      price: 5,
      stock: 100,
    });

    const paidAt = new Date("2026-06-11T12:00:00.000Z");

    await createOrder({
      customer,
      status: "partially_paid",
      items: [
        {
          product: productA._id,
          productName: "Historical Apples",
          variant: variantA._id,
          name: "Historical Apple Bag",
          sku: "APPLE-HIST",
          price: 2,
          quantity: 10,
          subtotal: 20,
        },
      ],
      overrides: {
        subtotal: 20,
        deliveryFee: 0,
        total: 20,
        amountPaid: 10,
        paidAt,
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [
        {
          product: productB._id,
          productName: "Historical Hamper",
          variant: variantB._id,
          name: "Historical Hamper Variant",
          sku: "HAMPER-HIST",
          price: 100,
          quantity: 1,
          subtotal: 100,
        },
      ],
      overrides: {
        subtotal: 100,
        deliveryFee: 0,
        total: 100,
        paidAt,
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [
        {
          product: productLegacy._id,
          variant: variantLegacy._id,
          name: "Legacy Variant Snapshot",
          sku: "LEGACY-SKU",
          price: 5,
          quantity: 2,
          subtotal: 10,
        },
      ],
      overrides: {
        subtotal: 10,
        deliveryFee: 0,
        total: 10,
        paidAt,
      },
    });

    await Product.updateOne({ _id: productA._id }, { $set: { name: "Renamed Apples" } });
    await Variant.updateOne(
      { _id: variantA._id },
      { $set: { name: "Renamed Variant", sku: "RENAMED-SKU" } },
    );

    await Variant.deleteOne({ _id: variantB._id });
    await Product.deleteOne({ _id: productB._id });
    await Variant.deleteOne({ _id: variantLegacy._id });
    await Product.deleteOne({ _id: productLegacy._id });

    const result = await analyticsService.GetTopProducts({
      from: "2026-06-10",
      to: "2026-06-12",
      limit: 10,
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);

    expect(result.data.byRevenue.map((p) => String(p.productId))).toEqual([
      String(productB._id),
      String(productA._id),
      String(productLegacy._id),
    ]);
    expect(result.data.byUnits.map((p) => String(p.productId))).toEqual([
      String(productA._id),
      String(productLegacy._id),
      String(productB._id),
    ]);

    const apples = result.data.byUnits[0];
    expect(apples).toEqual(
      expect.objectContaining({
        productName: "Historical Apples",
        catalogStatus: "active",
        totalRevenue: 10,
        totalQuantity: 10,
        averageSellingPrice: 1,
      }),
    );
    expect(apples.variants).toEqual([
      expect.objectContaining({
        name: "Historical Apple Bag",
        sku: "APPLE-HIST",
        revenue: 10,
        quantity: 10,
        averageSellingPrice: 1,
      }),
    ]);

    const deletedHamper = result.data.byRevenue[0];
    expect(deletedHamper).toEqual(
      expect.objectContaining({
        productName: "Historical Hamper",
        catalogStatus: "deleted",
        totalRevenue: 100,
        totalQuantity: 1,
      }),
    );

    const legacy = result.data.byRevenue.find(
      (p) => String(p.productId) === String(productLegacy._id),
    );
    expect(legacy.productName).toMatch(/^Deleted product · /);
    expect(legacy.catalogStatus).toBe("deleted");
    expect(legacy.variants[0]).toEqual(
      expect.objectContaining({
        name: "Legacy Variant Snapshot",
        sku: "LEGACY-SKU",
      }),
    );

    expect(result.data.products).toEqual(result.data.byRevenue);

    expect(result.data.totals).toEqual({
      totalRevenue: 120,
      totalUnits: 13,
      productsSold: 3,
    });

    expect(deletedHamper).toEqual(
      expect.objectContaining({
        orderCount: 1,
        averageRevenuePerOrder: 100,
        averageUnitsPerOrder: 1,
        revenueContributionPercent: 83.33,
        unitContributionPercent: 7.69,
      }),
    );

    expect(apples).toEqual(
      expect.objectContaining({
        orderCount: 1,
        averageRevenuePerOrder: 10,
        averageUnitsPerOrder: 10,
        revenueContributionPercent: 8.33,
        unitContributionPercent: 76.92,
      }),
    );

    expect(apples.variants[0]).toEqual(
      expect.objectContaining({
        orderCount: 1,
        averageRevenuePerOrder: 10,
        averageUnitsPerOrder: 10,
        revenueContributionPercent: 100,
        unitContributionPercent: 100,
      }),
    );

    expect(
      result.data.lowestByRevenue.map((p) => String(p.productId)),
    ).toEqual([
      String(productLegacy._id),
      String(productA._id),
      String(productB._id),
    ]);
    expect(
      result.data.lowestByUnits.map((p) => String(p.productId)),
    ).toEqual([
      String(productB._id),
      String(productLegacy._id),
      String(productA._id),
    ]);
  });

  test("allocates order-level discounts proportionally into product revenue", async () => {
    const customer = await createCustomer();
    const productA = await createProduct({ name: "Product A" });
    const variantA = await createVariant({ product: productA, price: 60, stock: 100 });
    const productB = await createProduct({ name: "Product B" });
    const variantB = await createVariant({ product: productB, price: 40, stock: 100 });

    await createOrder({
      customer,
      status: "paid",
      items: [
        {
          product: productA._id,
          productName: "Product A",
          variant: variantA._id,
          name: "A",
          sku: "A-SKU",
          price: 60,
          quantity: 1,
          subtotal: 60,
        },
        {
          product: productB._id,
          productName: "Product B",
          variant: variantB._id,
          name: "B",
          sku: "B-SKU",
          price: 40,
          quantity: 1,
          subtotal: 40,
        },
      ],
      overrides: {
        subtotal: 100,
        deliveryFee: 0,
        totalBeforeDiscount: 100,
        discountAmount: 20,
        isDiscounted: true,
        total: 80,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
      },
    });

    const result = await analyticsService.GetTopProducts({
      from: "2026-06-10",
      to: "2026-06-12",
      limit: 10,
      timeZone: "Europe/London",
    });

    const byId = new Map(
      result.data.byRevenue.map((product) => [String(product.productId), product]),
    );

    expect(byId.get(String(productA._id)).totalRevenue).toBe(48);
    expect(byId.get(String(productB._id)).totalRevenue).toBe(32);
  });
  test("counts unique product and variant orders without double-counting repeated lines", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Bundle Product" });
    const variantA = await createVariant({ product, price: 10, stock: 100 });
    const variantB = await createVariant({ product, price: 20, stock: 100 });
    const paidAt = new Date("2026-06-11T12:00:00.000Z");

    await createOrder({
      customer,
      status: "paid",
      items: [
        {
          product: product._id,
          productName: "Bundle Product",
          variant: variantA._id,
          name: "Small",
          sku: "BUNDLE-S",
          price: 10,
          quantity: 1,
          subtotal: 10,
        },
        {
          product: product._id,
          productName: "Bundle Product",
          variant: variantB._id,
          name: "Large",
          sku: "BUNDLE-L",
          price: 20,
          quantity: 2,
          subtotal: 40,
        },
      ],
      overrides: {
        subtotal: 50,
        total: 50,
        paidAt,
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [
        {
          product: product._id,
          productName: "Bundle Product",
          variant: variantA._id,
          name: "Small",
          sku: "BUNDLE-S",
          price: 10,
          quantity: 3,
          subtotal: 30,
        },
      ],
      overrides: {
        subtotal: 30,
        total: 30,
        paidAt,
      },
    });

    const result = await analyticsService.GetTopProducts({
      from: "2026-06-10",
      to: "2026-06-12",
      limit: 5,
      timeZone: "Europe/London",
    });

    const row = result.data.byRevenue[0];
    expect(row).toEqual(
      expect.objectContaining({
        totalRevenue: 80,
        totalQuantity: 6,
        orderCount: 2,
        averageRevenuePerOrder: 40,
        averageUnitsPerOrder: 3,
        revenueContributionPercent: 100,
        unitContributionPercent: 100,
      }),
    );

    const small = row.variants.find((variant) => variant.sku === "BUNDLE-S");
    const large = row.variants.find((variant) => variant.sku === "BUNDLE-L");

    expect(small).toEqual(
      expect.objectContaining({
        revenue: 40,
        quantity: 4,
        orderCount: 2,
        averageRevenuePerOrder: 20,
        averageUnitsPerOrder: 2,
        revenueContributionPercent: 50,
        unitContributionPercent: 66.67,
      }),
    );
    expect(large).toEqual(
      expect.objectContaining({
        revenue: 40,
        quantity: 2,
        orderCount: 1,
        averageRevenuePerOrder: 40,
        averageUnitsPerOrder: 2,
        revenueContributionPercent: 50,
        unitContributionPercent: 33.33,
      }),
    );
  });

});
