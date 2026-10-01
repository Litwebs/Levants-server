const analyticsService = require("../../services/analytics.admin.service");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics overview dashboard dataset", () => {
  test("returns core KPIs and previous-period changes from one dashboard response", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 10, stock: 50 });

    const currentItem = {
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: 40,
      quantity: 3,
      subtotal: 120,
    };

    const previousItem = {
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: 40,
      quantity: 2,
      subtotal: 80,
    };

    await createOrder({
      customer,
      status: "partially_refunded",
      items: [currentItem],
      overrides: {
        subtotal: 120,
        total: 120,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
        refunds: [
          {
            stripeRefundId: "re_overview",
            currency: "GBP",
            amount: 20,
            amountMinor: 2000,
            status: "succeeded",
            refundedAt: new Date("2026-06-12T12:00:00.000Z"),
          },
        ],
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [previousItem],
      overrides: {
        subtotal: 80,
        total: 80,
        paidAt: new Date("2026-06-08T12:00:00.000Z"),
      },
    });

    const result = await analyticsService.GetDashboard({
      range: "custom",
      from: "2026-06-10",
      to: "2026-06-12",
      interval: "day",
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data.overview.metrics).toEqual({
      netRevenue: 100,
      grossRevenue: 120,
      refundAmount: 20,
      totalOrders: 1,
      unitsSold: 3,
      averageOrderValue: 120,
      averageUnitsPerOrder: 3,
    });

    expect(result.data.salesTrends).toEqual(
      expect.objectContaining({
        interval: "day",
        channels: [
          expect.objectContaining({
            key: "website",
            points: [
              expect.objectContaining({
                label: "2026-06-10",
                netRevenue: 0,
              }),
              expect.objectContaining({
                label: "2026-06-11",
                grossRevenue: 120,
                netRevenue: 120,
                orders: 1,
              }),
              expect.objectContaining({
                label: "2026-06-12",
                refunds: 20,
                netRevenue: -20,
                orders: 0,
              }),
            ],
            totals: expect.objectContaining({
              grossRevenue: 120,
              refunds: 20,
              netRevenue: 100,
              orders: 1,
            }),
          }),
          expect.objectContaining({ key: "subscription" }),
          expect.objectContaining({ key: "imported" }),
        ],
      }),
    );

    expect(result.data.revenueComposition).toEqual({
      merchandiseRevenue: 120,
      deliveryRevenue: 0,
      discountAmount: 0,
      discountedOrders: 0,
      averageDiscountPerDiscountedOrder: 0,
      discountRate: 0,
      preDiscountRevenue: 120,
      grossRevenue: 120,
      refundAmount: 20,
      netRevenue: 100,
    });

    expect(result.data.salesBreakdown).toEqual(
      expect.objectContaining({
        channels: [
          expect.objectContaining({
            key: "website",
            grossRevenue: 120,
            refundAmount: 20,
            netRevenue: 100,
            totalOrders: 1,
            unitsSold: 3,
            grossRevenueShare: 100,
            orderShare: 100,
          }),
          expect.objectContaining({
            key: "subscription",
            grossRevenue: 0,
            totalOrders: 0,
          }),
          expect.objectContaining({
            key: "imported",
            grossRevenue: 0,
            totalOrders: 0,
          }),
        ],
        totals: expect.objectContaining({
          grossRevenue: 120,
          refundAmount: 20,
          netRevenue: 100,
          totalOrders: 1,
          unitsSold: 3,
        }),
      }),
    );

    expect(result.data.overview.comparison).toEqual(
      expect.objectContaining({
        available: true,
        strategy: "previous_period",
        currentPeriod: expect.objectContaining({
          from: "2026-06-10",
          to: "2026-06-12",
          days: 3,
        }),
        previousPeriod: expect.objectContaining({
          from: "2026-06-07",
          to: "2026-06-09",
          days: 3,
        }),
      }),
    );

    expect(result.data.overview.comparison.changes).toEqual(
      expect.objectContaining({
        grossRevenue: expect.objectContaining({
          current: 120,
          previous: 80,
          percentChange: 50,
        }),
        netRevenue: expect.objectContaining({
          current: 100,
          previous: 80,
          percentChange: 25,
        }),
        unitsSold: expect.objectContaining({
          current: 3,
          previous: 2,
          percentChange: 50,
        }),
        averageOrderValue: expect.objectContaining({
          current: 120,
          previous: 80,
          percentChange: 50,
        }),
        averageUnitsPerOrder: expect.objectContaining({
          current: 3,
          previous: 2,
          percentChange: 50,
        }),
      }),
    );

    // Backward-compatible summary must agree with the new overview contract.
    expect(result.data.summary.netRevenue).toBe(
      result.data.overview.metrics.netRevenue,
    );
    expect(result.data.summary.totalOrders).toBe(
      result.data.overview.metrics.totalOrders,
    );
    expect(result.data.summary.unitsSold).toBe(
      result.data.overview.metrics.unitsSold,
    );
  });
});
