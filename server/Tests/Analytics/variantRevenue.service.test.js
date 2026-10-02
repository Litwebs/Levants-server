const analyticsService = require("../../services/analytics.admin.service");
const Variant = require("../../models/variant.model");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics variant revenue", () => {
  test("ranks historical collected revenue with discounts and partial payments", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Current Juice" });
    const variantA = await createVariant({ product, price: 10, stock: 100 });
    const variantB = await createVariant({ product, price: 20, stock: 100 });

    await createOrder({
      customer,
      status: "paid",
      items: [
        {
          product: product._id,
          productName: "Historical Juice",
          variant: variantA._id,
          name: "Historical Small",
          sku: "REV-S-HIST",
          price: 10,
          quantity: 6,
          subtotal: 60,
        },
        {
          product: product._id,
          productName: "Historical Juice",
          variant: variantB._id,
          name: "Historical Large",
          sku: "REV-L-HIST",
          price: 20,
          quantity: 2,
          subtotal: 40,
        },
      ],
      overrides: {
        subtotal: 100,
        discountAmount: 20,
        total: 80,
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
          name: "Historical Small",
          sku: "REV-S-HIST",
          price: 10,
          quantity: 2,
          subtotal: 20,
        },
      ],
      overrides: {
        subtotal: 20,
        total: 20,
        amountPaid: 10,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
        metadata: { manualImport: true },
      },
    });

    await Variant.updateOne(
      { _id: variantA._id },
      { $set: { name: "Renamed Small", sku: "REV-S-NEW" } },
    );
    await Variant.deleteOne({ _id: variantB._id });

    const result = await analyticsService.GetVariantRevenue({
      from: "2026-06-10",
      to: "2026-06-12",
      limit: 10,
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data.totals).toEqual({
      totalRevenue: 90,
      variantsSold: 2,
    });
    expect(result.data.byRevenue.map((row) => String(row.variantId))).toEqual([
      String(variantA._id),
      String(variantB._id),
    ]);
    expect(result.data.byRevenue[0]).toEqual(
      expect.objectContaining({
        productId: product._id,
        productName: "Historical Juice",
        variantName: "Historical Small",
        sku: "REV-S-HIST",
        catalogStatus: "active",
        totalRevenue: 58,
        orderCount: 2,
      }),
    );
    expect(result.data.byRevenue[1]).toEqual(
      expect.objectContaining({
        variantName: "Historical Large",
        sku: "REV-L-HIST",
        catalogStatus: "deleted",
        totalRevenue: 32,
        orderCount: 1,
      }),
    );
    expect(result.data.variants).toEqual(result.data.byRevenue);
  });

  test("applies mutually exclusive source filters to variant revenue", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Source Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

    const item = {
      product: product._id,
      productName: "Source Product",
      variant: variant._id,
      name: "Source Variant",
      sku: "REV-SOURCE",
      price: 10,
      quantity: 2,
      subtotal: 20,
    };

    await createOrder({
      customer,
      status: "paid",
      items: [item],
      overrides: {
        subtotal: 20,
        total: 20,
        paidAt: new Date("2026-06-10T12:00:00.000Z"),
      },
    });

    await createOrder({
      customer,
      status: "partially_paid",
      items: [item],
      overrides: {
        subtotal: 20,
        total: 20,
        amountPaid: 10,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
        metadata: { manualImport: true },
      },
    });

    const website = await analyticsService.GetVariantRevenue({
      from: "2026-06-10",
      to: "2026-06-12",
      orderSource: "website",
      timeZone: "Europe/London",
    });
    const imported = await analyticsService.GetVariantRevenue({
      from: "2026-06-10",
      to: "2026-06-12",
      orderSource: "imported",
      timeZone: "Europe/London",
    });
    const subscription = await analyticsService.GetVariantRevenue({
      from: "2026-06-10",
      to: "2026-06-12",
      orderSource: "subscription",
      timeZone: "Europe/London",
    });

    expect(website.data.byRevenue[0].totalRevenue).toBe(20);
    expect(imported.data.byRevenue[0].totalRevenue).toBe(10);
    expect(subscription.data.byRevenue).toEqual([]);
    expect(subscription.data.totals).toEqual({
      totalRevenue: 0,
      variantsSold: 0,
    });
  });
});
