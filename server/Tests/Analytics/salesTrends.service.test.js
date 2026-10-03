const mongoose = require("mongoose");
const analyticsService = require("../../services/analytics.admin.service");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics sales channel trends", () => {
  async function fixture() {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 10, stock: 100 });

    const item = {
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: 10,
      quantity: 1,
      subtotal: 10,
    };

    return { customer, item };
  }

  test("reuses revenue buckets for website, subscription and imported trends", async () => {
    const { customer, item } = await fixture();

    await createOrder({
      customer,
      status: "paid",
      items: [item],
      overrides: {
        subtotal: 100,
        total: 100,
        paidAt: new Date("2026-06-10T12:00:00.000Z"),
      },
    });

    await createOrder({
      customer,
      status: "partially_refunded",
      items: [item],
      overrides: {
        subtotal: 60,
        total: 60,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
        orderType: "subscription_generated",
        subscription: new mongoose.Types.ObjectId(),
        refunds: [
          {
            stripeRefundId: "re_sales_trend_subscription",
            currency: "GBP",
            amount: 10,
            amountMinor: 1000,
            status: "succeeded",
            refundedAt: new Date("2026-06-12T12:00:00.000Z"),
          },
        ],
      },
    });

    await createOrder({
      customer,
      status: "partially_paid",
      items: [item],
      overrides: {
        subtotal: 80,
        total: 80,
        amountPaid: 40,
        paidAt: new Date("2026-06-12T12:00:00.000Z"),
        metadata: { manualImport: true },
      },
    });

    const result = await analyticsService.GetSalesTrends({
      from: "2026-06-10",
      to: "2026-06-12",
      interval: "day",
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data.interval).toBe("day");
    expect(result.data.channels.map((channel) => channel.key)).toEqual([
      "website",
      "subscription",
      "imported",
    ]);

    const [website, subscription, imported] = result.data.channels;

    expect(website.points).toEqual([
      {
        label: "2026-06-10",
        grossRevenue: 100,
        refunds: 0,
        netRevenue: 100,
        revenue: 100,
        orders: 1,
      },
      expect.objectContaining({ label: "2026-06-11", netRevenue: 0, orders: 0 }),
      expect.objectContaining({ label: "2026-06-12", netRevenue: 0, orders: 0 }),
    ]);

    expect(subscription.points).toEqual([
      expect.objectContaining({ label: "2026-06-10", netRevenue: 0, orders: 0 }),
      {
        label: "2026-06-11",
        grossRevenue: 60,
        refunds: 0,
        netRevenue: 60,
        revenue: 60,
        orders: 1,
      },
      {
        label: "2026-06-12",
        grossRevenue: 0,
        refunds: 10,
        netRevenue: -10,
        revenue: -10,
        orders: 0,
      },
    ]);

    expect(imported.points).toEqual([
      expect.objectContaining({ label: "2026-06-10", netRevenue: 0, orders: 0 }),
      expect.objectContaining({ label: "2026-06-11", netRevenue: 0, orders: 0 }),
      {
        label: "2026-06-12",
        grossRevenue: 40,
        refunds: 0,
        netRevenue: 40,
        revenue: 40,
        orders: 1,
      },
    ]);

    expect(website.totals).toEqual({
      grossRevenue: 100,
      refunds: 0,
      netRevenue: 100,
      revenue: 100,
      orders: 1,
    });
    expect(subscription.totals).toEqual({
      grossRevenue: 60,
      refunds: 10,
      netRevenue: 50,
      revenue: 50,
      orders: 1,
    });
    expect(imported.totals).toEqual({
      grossRevenue: 40,
      refunds: 0,
      netRevenue: 40,
      revenue: 40,
      orders: 1,
    });
  });

  test("source filtering preserves aligned zero-filled channel series", async () => {
    const { customer, item } = await fixture();

    await createOrder({
      customer,
      status: "paid",
      items: [item],
      overrides: {
        subtotal: 30,
        total: 30,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
        metadata: { manualImport: true },
      },
    });

    const result = await analyticsService.GetSalesTrends({
      from: "2026-06-10",
      to: "2026-06-12",
      interval: "day",
      orderSource: "imported",
      timeZone: "Europe/London",
    });

    expect(result.data.channels).toHaveLength(3);
    expect(result.data.channels[0].points).toHaveLength(3);
    expect(result.data.channels[1].points).toHaveLength(3);
    expect(result.data.channels[0].totals.netRevenue).toBe(0);
    expect(result.data.channels[1].totals.netRevenue).toBe(0);
    expect(result.data.channels[2].totals.netRevenue).toBe(30);
    expect(result.data.channels[2].points[1]).toEqual(
      expect.objectContaining({
        label: "2026-06-11",
        netRevenue: 30,
        orders: 1,
      }),
    );
  });
});
