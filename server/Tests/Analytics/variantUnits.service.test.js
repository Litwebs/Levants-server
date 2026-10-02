const analyticsService = require("../../services/analytics.admin.service");
const Variant = require("../../models/variant.model");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics variant units", () => {
  test("ranks historical variant units, de-duplicates orders, and survives rename/delete", async () => {
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
          sku: "JUICE-S-HIST",
          price: 10,
          quantity: 2,
          subtotal: 20,
        },
        {
          product: product._id,
          productName: "Historical Juice",
          variant: variantA._id,
          name: "Historical Small",
          sku: "JUICE-S-HIST",
          price: 10,
          quantity: 1,
          subtotal: 10,
        },
        {
          product: product._id,
          productName: "Historical Juice",
          variant: variantB._id,
          name: "Historical Large",
          sku: "JUICE-L-HIST",
          price: 20,
          quantity: 2,
          subtotal: 40,
        },
      ],
      overrides: {
        subtotal: 70,
        total: 70,
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
          sku: "JUICE-S-HIST",
          price: 10,
          quantity: 4,
          subtotal: 40,
        },
      ],
      overrides: {
        subtotal: 40,
        total: 40,
        amountPaid: 20,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
        metadata: { manualImport: true },
      },
    });

    await Variant.updateOne(
      { _id: variantA._id },
      { $set: { name: "Renamed Small", sku: "JUICE-S-NEW" } },
    );
    await Variant.deleteOne({ _id: variantB._id });

    const result = await analyticsService.GetVariantUnits({
      from: "2026-06-10",
      to: "2026-06-12",
      limit: 10,
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data.totals).toEqual({
      totalUnits: 9,
      variantsSold: 2,
    });
    expect(result.data.byUnits.map((row) => String(row.variantId))).toEqual([
      String(variantA._id),
      String(variantB._id),
    ]);

    expect(result.data.byUnits[0]).toEqual(
      expect.objectContaining({
        productId: product._id,
        productName: "Historical Juice",
        variantName: "Historical Small",
        sku: "JUICE-S-HIST",
        catalogStatus: "active",
        totalUnits: 7,
        orderCount: 2,
        averageUnitsPerOrder: 3.5,
      }),
    );
    expect(result.data.byUnits[1]).toEqual(
      expect.objectContaining({
        variantName: "Historical Large",
        sku: "JUICE-L-HIST",
        catalogStatus: "deleted",
        totalUnits: 2,
        orderCount: 1,
        averageUnitsPerOrder: 2,
      }),
    );
    expect(result.data.variants).toEqual(result.data.byUnits);
  });

  test("applies mutually exclusive source filters to variant units", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Source Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

    await createOrder({
      customer,
      status: "paid",
      items: [{
        product: product._id,
        productName: "Source Product",
        variant: variant._id,
        name: "Source Variant",
        sku: "SOURCE-V",
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
        product: product._id,
        productName: "Source Product",
        variant: variant._id,
        name: "Source Variant",
        sku: "SOURCE-V",
        price: 10,
        quantity: 3,
        subtotal: 30,
      }],
      overrides: {
        subtotal: 30,
        total: 30,
        amountPaid: 15,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
        metadata: { manualImport: true },
      },
    });

    const website = await analyticsService.GetVariantUnits({
      from: "2026-06-10",
      to: "2026-06-12",
      orderSource: "website",
      timeZone: "Europe/London",
    });
    const imported = await analyticsService.GetVariantUnits({
      from: "2026-06-10",
      to: "2026-06-12",
      orderSource: "imported",
      timeZone: "Europe/London",
    });
    const subscription = await analyticsService.GetVariantUnits({
      from: "2026-06-10",
      to: "2026-06-12",
      orderSource: "subscription",
      timeZone: "Europe/London",
    });

    expect(website.data.byUnits[0].totalUnits).toBe(2);
    expect(imported.data.byUnits[0].totalUnits).toBe(3);
    expect(subscription.data.byUnits).toEqual([]);
    expect(subscription.data.totals).toEqual({
      totalUnits: 0,
      variantsSold: 0,
    });
  });
});
