const mongoose = require("mongoose");
const Order = require("../../models/order.model");
const analyticsService = require("../../services/analytics.admin.service");
const {
  formatYmdInTimeZone,
} = require("../../utils/analyticsDate.util");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics financial foundation", () => {
  async function fixture() {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 10, stock: 50 });

    const item = {
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: variant.price,
      quantity: 1,
      subtotal: variant.price,
    };

    return { customer, product, variant, item };
  }

  test("separates gross sales, refunds and net revenue across mutually exclusive sources", async () => {
    const { customer, item } = await fixture();
    const now = new Date();

    await createOrder({
      customer,
      status: "pending",
      items: [item],
      overrides: { total: 10 },
    });

    await createOrder({
      customer,
      status: "unpaid",
      items: [item],
      overrides: { total: 10 },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [item],
      overrides: { total: 20, paidAt: now },
    });

    await createOrder({
      customer,
      status: "partially_refunded",
      items: [item],
      overrides: {
        total: 15,
        paidAt: now,
        refunds: [
          {
            stripeRefundId: "re_partial",
            currency: "GBP",
            amount: 5,
            amountMinor: 500,
            status: "succeeded",
            refundedAt: now,
          },
        ],
      },
    });

    await createOrder({
      customer,
      status: "refunded",
      items: [item],
      overrides: {
        total: 8,
        paidAt: now,
        refund: {
          stripeRefundId: "re_legacy",
          refundedAt: now,
        },
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [item],
      overrides: {
        total: 25,
        paidAt: now,
        metadata: { manualImport: true },
      },
    });

    await createOrder({
      customer,
      status: "partially_paid",
      items: [item],
      overrides: {
        total: 40,
        amountPaid: 10,
        paidAt: now,
        metadata: { manualImport: true },
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [item],
      overrides: {
        total: 12,
        paidAt: now,
        orderType: "subscription_generated",
        subscription: new mongoose.Types.ObjectId(),
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [item],
      overrides: {
        total: 99,
        paidAt: now,
        archived: true,
        archivedAt: now,
      },
    });

    const all = await analyticsService.GetSummary({ range: "all" });
    const website = await analyticsService.GetSummary({
      range: "all",
      orderSource: "website",
    });
    const imported = await analyticsService.GetSummary({
      range: "all",
      orderSource: "imported",
    });
    const subscription = await analyticsService.GetSummary({
      range: "all",
      orderSource: "subscription",
    });

    expect(all.success).toBe(true);
    expect(all.data).toEqual(
      expect.objectContaining({
        totalOrders: 6,
        grossRevenue: 90,
        refundAmount: 13,
        netRevenue: 77,
        revenue: 77,
        averageOrderValue: 15,
        unitsSold: 6,
        averageUnitsPerOrder: 1,
        pendingOrders: 2,
        paidOrders: 3,
        partiallyPaidOrders: 1,
        refundedOrders: 2,
        totalRefunds: 2,
      }),
    );

    expect(website.data).toEqual(
      expect.objectContaining({
        totalOrders: 3,
        grossRevenue: 43,
        refundAmount: 13,
        netRevenue: 30,
      }),
    );

    expect(imported.data).toEqual(
      expect.objectContaining({
        totalOrders: 2,
        grossRevenue: 35,
        refundAmount: 0,
        netRevenue: 35,
      }),
    );

    expect(subscription.data).toEqual(
      expect.objectContaining({
        totalOrders: 1,
        grossRevenue: 12,
        refundAmount: 0,
        netRevenue: 12,
      }),
    );
  });

  test("financial periods use paidAt rather than order creation time", async () => {
    const { customer, item } = await fixture();
    const now = new Date();
    const today = formatYmdInTimeZone(now, "Europe/London");
    const old = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const paidToday = await createOrder({
      customer,
      status: "paid",
      items: [item],
      overrides: {
        total: 30,
        paidAt: now,
      },
    });

    await Order.collection.updateOne(
      { _id: paidToday._id },
      { $set: { createdAt: old } },
    );

    await createOrder({
      customer,
      status: "paid",
      items: [item],
      overrides: {
        total: 40,
        paidAt: old,
      },
    });

    const summary = await analyticsService.GetSummary({
      from: today,
      to: today,
      timeZone: "Europe/London",
    });
    const series = await analyticsService.GetRevenueSeries({
      from: today,
      to: today,
      interval: "day",
      timeZone: "Europe/London",
    });

    expect(summary.data.totalOrders).toBe(1);
    expect(summary.data.grossRevenue).toBe(30);
    expect(summary.data.netRevenue).toBe(30);

    expect(series.data.points).toEqual([
      expect.objectContaining({
        label: today,
        grossRevenue: 30,
        refunds: 0,
        netRevenue: 30,
        revenue: 30,
        orders: 1,
      }),
    ]);
  });

  test("refunds are booked on refund date, independently of the sale date", async () => {
    const { customer, item } = await fixture();
    const now = new Date();
    const today = formatYmdInTimeZone(now, "Europe/London");
    const old = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    await createOrder({
      customer,
      status: "partially_refunded",
      items: [item],
      overrides: {
        total: 20,
        paidAt: old,
        refunds: [
          {
            stripeRefundId: "re_later",
            currency: "GBP",
            amount: 6,
            amountMinor: 600,
            status: "succeeded",
            refundedAt: now,
          },
        ],
      },
    });

    const summary = await analyticsService.GetSummary({
      from: today,
      to: today,
      timeZone: "Europe/London",
    });
    const series = await analyticsService.GetRevenueSeries({
      from: today,
      to: today,
      interval: "day",
      timeZone: "Europe/London",
    });

    expect(summary.data.grossRevenue).toBe(0);
    expect(summary.data.refundAmount).toBe(6);
    expect(summary.data.netRevenue).toBe(-6);

    expect(series.data.points).toEqual([
      expect.objectContaining({
        label: today,
        grossRevenue: 0,
        refunds: 6,
        netRevenue: -6,
        revenue: -6,
        orders: 0,
      }),
    ]);
  });
  test("compares KPI performance against the resolved previous period", async () => {
    const { customer, item } = await fixture();

    const currentItemTwo = {
      ...item,
      quantity: 2,
      subtotal: item.price * 2,
    };

    await createOrder({
      customer,
      status: "paid",
      items: [currentItemTwo],
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
        subtotal: 50,
        total: 50,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
        refunds: [
          {
            stripeRefundId: "re_comparison_current",
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
      status: "paid",
      items: [item],
      overrides: {
        subtotal: 100,
        total: 100,
        paidAt: new Date("2026-06-08T12:00:00.000Z"),
      },
    });

    const result = await analyticsService.GetSummaryComparison({
      range: "custom",
      from: "2026-06-10",
      to: "2026-06-12",
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
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
        current: expect.objectContaining({
          grossRevenue: 150,
          refundAmount: 10,
          netRevenue: 140,
          totalOrders: 2,
          unitsSold: 3,
          averageOrderValue: 75,
          averageUnitsPerOrder: 1.5,
        }),
        previous: expect.objectContaining({
          grossRevenue: 100,
          refundAmount: 0,
          netRevenue: 100,
          totalOrders: 1,
          unitsSold: 1,
          averageOrderValue: 100,
          averageUnitsPerOrder: 1,
        }),
      }),
    );

    expect(result.data.changes.grossRevenue).toEqual(
      expect.objectContaining({
        absoluteChange: 50,
        percentChange: 50,
        direction: "up",
      }),
    );
    expect(result.data.changes.netRevenue.percentChange).toBe(40);
    expect(result.data.changes.totalOrders.percentChange).toBe(100);
    expect(result.data.changes.unitsSold.percentChange).toBe(200);
    expect(result.data.changes.averageOrderValue.percentChange).toBe(-25);
    expect(result.data.changes.averageUnitsPerOrder.percentChange).toBe(50);
    expect(result.data.changes.refundAmount).toEqual(
      expect.objectContaining({
        current: 10,
        previous: 0,
        percentChange: null,
        percentChangeAvailable: false,
      }),
    );
  });

  test("all-time comparison is explicitly unavailable", async () => {
    const result = await analyticsService.GetSummaryComparison({
      range: "all",
      timeZone: "Europe/London",
    });

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        available: false,
        reason: "unbounded_range",
        current: null,
        previous: null,
        changes: null,
      }),
    });
  });

});
