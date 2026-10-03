const mongoose = require("mongoose");
const analyticsService = require("../../services/analytics.admin.service");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics sales channel breakdown", () => {
  test("classifies website, subscription and imported sales without double counting", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 10, stock: 100 });

    const item = (quantity) => ({
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: 10,
      quantity,
      subtotal: quantity * 10,
    });

    const now = new Date("2026-06-11T12:00:00.000Z");
    const refundNow = new Date("2026-06-12T12:00:00.000Z");
    const oldPaidAt = new Date("2026-06-01T12:00:00.000Z");

    await createOrder({
      customer,
      status: "paid",
      items: [item(2)],
      overrides: {
        subtotal: 100,
        total: 100,
        paidAt: now,
      },
    });

    await createOrder({
      customer,
      status: "partially_refunded",
      items: [item(1)],
      overrides: {
        subtotal: 50,
        total: 50,
        paidAt: now,
        refunds: [
          {
            stripeRefundId: "re_salesmix_website",
            currency: "GBP",
            amount: 10,
            amountMinor: 1000,
            status: "succeeded",
            refundedAt: refundNow,
          },
        ],
      },
    });

    const subscriptionId = new mongoose.Types.ObjectId();

    await createOrder({
      customer,
      status: "paid",
      items: [item(3)],
      overrides: {
        subtotal: 60,
        total: 60,
        paidAt: now,
        orderType: "subscription_generated",
        subscription: subscriptionId,
      },
    });

    // The sale itself is outside the selected period, but the refund belongs
    // inside it and must reduce the subscription channel for this period.
    await createOrder({
      customer,
      status: "partially_refunded",
      items: [item(1)],
      overrides: {
        subtotal: 25,
        total: 25,
        paidAt: oldPaidAt,
        orderType: "subscription_generated",
        subscription: new mongoose.Types.ObjectId(),
        refunds: [
          {
            stripeRefundId: "re_salesmix_subscription",
            currency: "GBP",
            amount: 5,
            amountMinor: 500,
            status: "succeeded",
            refundedAt: refundNow,
          },
        ],
      },
    });

    await createOrder({
      customer,
      status: "partially_paid",
      items: [item(4)],
      overrides: {
        subtotal: 80,
        total: 80,
        amountPaid: 30,
        paidAt: now,
        metadata: { manualImport: true },
      },
    });

    // Imported/manual wins classification precedence even if legacy data also
    // carries subscription markers.
    await createOrder({
      customer,
      status: "paid",
      items: [item(1)],
      overrides: {
        subtotal: 20,
        total: 20,
        paidAt: now,
        metadata: { manualImport: true },
        orderType: "subscription_generated",
        subscription: new mongoose.Types.ObjectId(),
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [item(9)],
      overrides: {
        subtotal: 999,
        total: 999,
        paidAt: now,
        archived: true,
        archivedAt: now,
      },
    });

    const result = await analyticsService.GetSalesBreakdown({
      from: "2026-06-10",
      to: "2026-06-12",
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data.channels).toEqual([
      {
        key: "website",
        label: "Website One-Time",
        grossRevenue: 150,
        merchandiseRevenue: 150,
        deliveryRevenue: 0,
        discountAmount: 0,
        discountedOrders: 0,
        refundAmount: 10,
        netRevenue: 140,
        totalOrders: 2,
        unitsSold: 3,
        averageOrderValue: 75,
        averageUnitsPerOrder: 1.5,
        averageDiscountPerDiscountedOrder: 0,
        discountRate: 0,
        grossRevenueShare: 57.69,
        orderShare: 40,
      },
      {
        key: "subscription",
        label: "Subscription",
        grossRevenue: 60,
        merchandiseRevenue: 60,
        deliveryRevenue: 0,
        discountAmount: 0,
        discountedOrders: 0,
        refundAmount: 5,
        netRevenue: 55,
        totalOrders: 1,
        unitsSold: 3,
        averageOrderValue: 60,
        averageUnitsPerOrder: 3,
        averageDiscountPerDiscountedOrder: 0,
        discountRate: 0,
        grossRevenueShare: 23.08,
        orderShare: 20,
      },
      {
        key: "imported",
        label: "Imported",
        grossRevenue: 50,
        merchandiseRevenue: 50,
        deliveryRevenue: 0,
        discountAmount: 0,
        discountedOrders: 0,
        refundAmount: 0,
        netRevenue: 50,
        totalOrders: 2,
        unitsSold: 5,
        averageOrderValue: 25,
        averageUnitsPerOrder: 2.5,
        averageDiscountPerDiscountedOrder: 0,
        discountRate: 0,
        grossRevenueShare: 19.23,
        orderShare: 40,
      },
    ]);

    expect(result.data.totals).toEqual({
      grossRevenue: 260,
      merchandiseRevenue: 260,
      deliveryRevenue: 0,
      discountAmount: 0,
      discountedOrders: 0,
      refundAmount: 15,
      netRevenue: 245,
      totalOrders: 5,
      unitsSold: 11,
      averageOrderValue: 52,
      averageUnitsPerOrder: 2.2,
      averageDiscountPerDiscountedOrder: 0,
      discountRate: 0,
    });

    const importedOnly = await analyticsService.GetSalesBreakdown({
      from: "2026-06-10",
      to: "2026-06-12",
      orderSource: "imported",
      timeZone: "Europe/London",
    });

    expect(importedOnly.data.totals).toEqual({
      grossRevenue: 50,
      merchandiseRevenue: 50,
      deliveryRevenue: 0,
      discountAmount: 0,
      discountedOrders: 0,
      refundAmount: 0,
      netRevenue: 50,
      totalOrders: 2,
      unitsSold: 5,
      averageOrderValue: 25,
      averageUnitsPerOrder: 2.5,
      averageDiscountPerDiscountedOrder: 0,
      discountRate: 0,
    });
    expect(importedOnly.data.channels).toEqual([
      expect.objectContaining({
        key: "website",
        grossRevenue: 0,
        totalOrders: 0,
        grossRevenueShare: 0,
      }),
      expect.objectContaining({
        key: "subscription",
        grossRevenue: 0,
        totalOrders: 0,
        grossRevenueShare: 0,
      }),
      expect.objectContaining({
        key: "imported",
        grossRevenue: 50,
        totalOrders: 2,
        grossRevenueShare: 100,
        orderShare: 100,
      }),
    ]);
  });

  test("returns stable zero rows for channels with no sales", async () => {
    const result = await analyticsService.GetSalesBreakdown({
      from: "2026-01-01",
      to: "2026-01-02",
      timeZone: "Europe/London",
    });

    expect(result.data.channels.map((channel) => channel.key)).toEqual([
      "website",
      "subscription",
      "imported",
    ]);
    expect(
      result.data.channels.every(
        (channel) =>
          channel.grossRevenue === 0 &&
          channel.refundAmount === 0 &&
          channel.totalOrders === 0 &&
          channel.grossRevenueShare === 0,
      ),
    ).toBe(true);
  });
});
