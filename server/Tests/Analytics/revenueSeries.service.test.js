const analyticsService = require("../../services/analytics.admin.service");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics revenue/orders time series", () => {
  async function fixture() {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 10, stock: 50 });

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

  test("daily custom range includes zero days and refund-only days", async () => {
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
        subtotal: 40,
        total: 40,
        paidAt: new Date("2026-06-08T12:00:00.000Z"),
        refunds: [
          {
            stripeRefundId: "re_series_refund",
            currency: "GBP",
            amount: 15,
            amountMinor: 1500,
            status: "succeeded",
            refundedAt: new Date("2026-06-12T12:00:00.000Z"),
          },
        ],
      },
    });

    const result = await analyticsService.GetRevenueSeries({
      from: "2026-06-10",
      to: "2026-06-12",
      interval: "day",
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data.interval).toBe("day");
    expect(result.data.period).toEqual({
      from: "2026-06-10",
      to: "2026-06-12",
      timeZone: "Europe/London",
    });
    expect(result.data.points).toEqual([
      {
        label: "2026-06-10",
        grossRevenue: 100,
        refunds: 0,
        netRevenue: 100,
        revenue: 100,
        orders: 1,
      },
      {
        label: "2026-06-11",
        grossRevenue: 0,
        refunds: 0,
        netRevenue: 0,
        revenue: 0,
        orders: 0,
      },
      {
        label: "2026-06-12",
        grossRevenue: 0,
        refunds: 15,
        netRevenue: -15,
        revenue: -15,
        orders: 0,
      },
    ]);
    expect(result.data.totals).toEqual({
      grossRevenue: 100,
      refunds: 15,
      netRevenue: 85,
      revenue: 85,
      orders: 1,
    });
  });

  test("weekly buckets aggregate orders and preserve empty weeks", async () => {
    const { customer, item } = await fixture();

    await createOrder({
      customer,
      status: "paid",
      items: [item],
      overrides: {
        subtotal: 25,
        total: 25,
        paidAt: new Date("2026-06-02T12:00:00.000Z"),
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [item],
      overrides: {
        subtotal: 35,
        total: 35,
        paidAt: new Date("2026-06-17T12:00:00.000Z"),
      },
    });

    const result = await analyticsService.GetRevenueSeries({
      from: "2026-06-01",
      to: "2026-06-21",
      interval: "week",
      timeZone: "Europe/London",
    });

    expect(result.data.points).toEqual([
      expect.objectContaining({
        label: "2026-W23",
        grossRevenue: 25,
        netRevenue: 25,
        orders: 1,
      }),
      {
        label: "2026-W24",
        grossRevenue: 0,
        refunds: 0,
        netRevenue: 0,
        revenue: 0,
        orders: 0,
      },
      expect.objectContaining({
        label: "2026-W25",
        grossRevenue: 35,
        netRevenue: 35,
        orders: 1,
      }),
    ]);
    expect(result.data.totals.orders).toBe(2);
    expect(result.data.totals.netRevenue).toBe(60);
  });

  test("monthly and yearly custom ranges include empty buckets", async () => {
    const monthly = await analyticsService.GetRevenueSeries({
      from: "2026-01-15",
      to: "2026-03-02",
      interval: "month",
      timeZone: "Europe/London",
    });

    expect(monthly.data.points.map((point) => point.label)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(monthly.data.points.every((point) => point.revenue === 0)).toBe(true);

    const yearly = await analyticsService.GetRevenueSeries({
      from: "2024-06-01",
      to: "2026-06-01",
      interval: "year",
      timeZone: "Europe/London",
    });

    expect(yearly.data.points.map((point) => point.label)).toEqual([
      "2024",
      "2025",
      "2026",
    ]);
  });
});
