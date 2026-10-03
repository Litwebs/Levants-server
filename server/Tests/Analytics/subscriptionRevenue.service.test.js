const mongoose = require("mongoose");
const analyticsService = require("../../services/analytics.admin.service");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics subscription revenue", () => {
  test("uses collected subscription-channel revenue, partial payments and in-period refunds only", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Subscription Revenue Product" });
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

    await createOrder({
      customer,
      status: "paid",
      items: [item(3)],
      overrides: {
        subtotal: 60,
        total: 60,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
        orderType: "subscription_generated",
        subscription: new mongoose.Types.ObjectId(),
      },
    });

    await createOrder({
      customer,
      status: "partially_paid",
      items: [item(4)],
      overrides: {
        subtotal: 40,
        total: 40,
        amountPaid: 20,
        paidAt: new Date("2026-06-11T13:00:00.000Z"),
        subscription: new mongoose.Types.ObjectId(),
      },
    });

    // Sale is before the selected period, but the refund event is inside it.
    await createOrder({
      customer,
      status: "partially_refunded",
      items: [item(1)],
      overrides: {
        subtotal: 25,
        total: 25,
        paidAt: new Date("2026-06-01T12:00:00.000Z"),
        orderType: "subscription_generated",
        subscription: new mongoose.Types.ObjectId(),
        refunds: [{
          stripeRefundId: "re_subscription_revenue",
          currency: "GBP",
          amount: 5,
          amountMinor: 500,
          status: "succeeded",
          refundedAt: new Date("2026-06-12T12:00:00.000Z"),
        }],
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [item(10)],
      overrides: {
        subtotal: 100,
        total: 100,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
      },
    });

    // Imported/manual classification wins even when subscription markers exist.
    await createOrder({
      customer,
      status: "paid",
      items: [item(5)],
      overrides: {
        subtotal: 50,
        total: 50,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
        metadata: { manualImport: true },
        orderType: "subscription_generated",
        subscription: new mongoose.Types.ObjectId(),
      },
    });

    const result = await analyticsService.GetSubscriptionRevenue({
      from: "2026-06-10",
      to: "2026-06-12",
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      subscriptionRevenue: 75,
      grossRevenue: 80,
      merchandiseRevenue: 80,
      deliveryRevenue: 0,
      discountAmount: 0,
      refundAmount: 5,
      totalOrders: 2,
      unitsSold: 7,
      metricBasis: {
        subscriptionRevenue: expect.stringContaining(
          "collected gross subscription sales minus subscription refunds",
        ),
        channel: expect.stringContaining("mutually exclusive"),
        source: expect.stringContaining("Subscription channel"),
      },
    });
  });

  test("returns a stable zero shape with no subscription revenue", async () => {
    const result = await analyticsService.GetSubscriptionRevenue({
      from: "2026-01-01",
      to: "2026-01-02",
      timeZone: "Europe/London",
    });

    expect(result.data).toEqual({
      subscriptionRevenue: 0,
      grossRevenue: 0,
      merchandiseRevenue: 0,
      deliveryRevenue: 0,
      discountAmount: 0,
      refundAmount: 0,
      totalOrders: 0,
      unitsSold: 0,
      metricBasis: expect.objectContaining({
        subscriptionRevenue: expect.any(String),
        channel: expect.any(String),
        source: expect.any(String),
      }),
    });
  });
});
