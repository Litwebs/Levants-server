const mongoose = require("mongoose");
const analyticsService = require("../../services/analytics.admin.service");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics variant sales mix", () => {
  test("separates website one-time, subscription and imported variant sales", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Mix Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

    const item = (quantity) => ({
      product: product._id,
      productName: "Historical Mix Product",
      variant: variant._id,
      name: "Historical Mix Variant",
      sku: "MIX-HIST",
      price: 10,
      quantity,
      subtotal: quantity * 10,
    });

    await createOrder({
      customer,
      status: "paid",
      items: [item(2)],
      overrides: {
        subtotal: 20,
        total: 20,
        paidAt: new Date("2026-06-10T12:00:00.000Z"),
      },
    });

    await createOrder({
      customer,
      status: "partially_paid",
      items: [item(3)],
      overrides: {
        subtotal: 30,
        total: 30,
        amountPaid: 15,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
        orderType: "subscription_generated",
        subscription: new mongoose.Types.ObjectId(),
      },
    });

    // Imported/manual classification has precedence even if legacy data also
    // carries subscription markers.
    await createOrder({
      customer,
      status: "partially_paid",
      items: [item(4)],
      overrides: {
        subtotal: 40,
        total: 40,
        amountPaid: 20,
        paidAt: new Date("2026-06-12T12:00:00.000Z"),
        metadata: { manualImport: true },
        orderType: "subscription_generated",
        subscription: new mongoose.Types.ObjectId(),
      },
    });

    const result = await analyticsService.GetVariantSalesMix({
      from: "2026-06-10",
      to: "2026-06-12",
      limit: 10,
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data.totals).toEqual({
      oneTime: { revenue: 20, units: 2 },
      subscription: { revenue: 15, units: 3 },
      importedExcluded: { revenue: 20, units: 4 },
    });
    expect(result.data.variants).toEqual([
      expect.objectContaining({
        productId: product._id,
        variantId: variant._id,
        productName: "Historical Mix Product",
        variantName: "Historical Mix Variant",
        sku: "MIX-HIST",
        oneTime: { revenue: 20, units: 2, orders: 1 },
        subscription: { revenue: 15, units: 3, orders: 1 },
        importedExcluded: { revenue: 20, units: 4, orders: 1 },
      }),
    ]);
  });

  test("does not misclassify imported-only filtered sales as one-time or subscription", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Imported Mix Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

    await createOrder({
      customer,
      status: "paid",
      items: [{
        product: product._id,
        productName: "Imported Mix Product",
        variant: variant._id,
        name: "Imported Variant",
        sku: "IMPORTED-MIX",
        price: 10,
        quantity: 2,
        subtotal: 20,
      }],
      overrides: {
        subtotal: 20,
        total: 20,
        paidAt: new Date("2026-06-10T12:00:00.000Z"),
        metadata: { manualImport: true },
        orderType: "subscription_generated",
        subscription: new mongoose.Types.ObjectId(),
      },
    });

    const result = await analyticsService.GetVariantSalesMix({
      from: "2026-06-10",
      to: "2026-06-12",
      orderSource: "imported",
      timeZone: "Europe/London",
    });

    expect(result.data.variants).toEqual([]);
    expect(result.data.totals).toEqual({
      oneTime: { revenue: 0, units: 0 },
      subscription: { revenue: 0, units: 0 },
      importedExcluded: { revenue: 20, units: 2 },
    });
  });
});
