const mongoose = require("mongoose");
const analyticsService = require("../../services/analytics.admin.service");
const Subscription = require("../../models/subscription.model");
const { createCustomer, createProduct, createVariant, createOrder } = require("../Orders/helpers/orderFactory");

describe("analytics subscription trends", () => {
  async function createSubscriptionAt({ customer, product, variant, createdAt, status = "active", cancelledAt = null }) {
    const sub = await Subscription.create({
      customer: customer._id,
      status,
      cancelledAt,
      frequency: "weekly",
      preferredDeliveryDay: 2,
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      nextDeliveryDate: new Date("2026-06-17T00:00:00.000Z"),
      deliveryAddress: {
        line1: "1 Analytics Road",
        city: "London",
        postcode: "SW1A 1AA",
        country: "GB",
      },
      items: [{
        product: product._id,
        variant: variant._id,
        name: variant.name,
        sku: variant.sku,
        quantity: 1,
        unitPrice: 10,
      }],
    });
    await Subscription.collection.updateOne(
      { _id: sub._id },
      { $set: { createdAt: new Date(createdAt), status, cancelledAt } },
    );
    return sub;
  }

  test("aligns acquisition, effective cancellation and subscription revenue/refund buckets", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Subscription Trend Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

    await createSubscriptionAt({
      customer, product, variant,
      createdAt: "2026-06-10T12:00:00.000Z",
    });
    await createSubscriptionAt({
      customer, product, variant,
      createdAt: "2026-06-01T12:00:00.000Z",
      status: "cancelled",
      cancelledAt: new Date("2026-06-11T12:00:00.000Z"),
    });
    await createSubscriptionAt({
      customer, product, variant,
      createdAt: "2026-06-12T12:00:00.000Z",
    });

    const item = {
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: 10,
      quantity: 1,
      subtotal: 10,
    };

    await createOrder({
      customer,
      status: "partially_refunded",
      items: [item],
      overrides: {
        subtotal: 50,
        total: 50,
        paidAt: new Date("2026-06-10T12:00:00.000Z"),
        orderType: "subscription_generated",
        subscription: new mongoose.Types.ObjectId(),
        refunds: [{
          stripeRefundId: "re_subscription_trend",
          currency: "GBP",
          amount: 10,
          amountMinor: 1000,
          status: "succeeded",
          refundedAt: new Date("2026-06-12T12:00:00.000Z"),
        }],
      },
    });

    const result = await analyticsService.GetSubscriptionTrends({
      from: "2026-06-10",
      to: "2026-06-12",
      interval: "day",
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data.points).toEqual([
      {
        label: "2026-06-10",
        newSubscriptions: 1,
        cancelledSubscriptions: 0,
        grossRevenue: 50,
        refunds: 0,
        netRevenue: 50,
        revenue: 50,
        orders: 1,
      },
      {
        label: "2026-06-11",
        newSubscriptions: 0,
        cancelledSubscriptions: 1,
        grossRevenue: 0,
        refunds: 0,
        netRevenue: 0,
        revenue: 0,
        orders: 0,
      },
      {
        label: "2026-06-12",
        newSubscriptions: 1,
        cancelledSubscriptions: 0,
        grossRevenue: 0,
        refunds: 10,
        netRevenue: -10,
        revenue: -10,
        orders: 0,
      },
    ]);
    expect(result.data.totals).toEqual({
      newSubscriptions: 2,
      cancelledSubscriptions: 1,
      grossRevenue: 50,
      refunds: 10,
      netRevenue: 40,
      revenue: 40,
      orders: 1,
    });
  });

  test("protects unbounded fine-grained series", async () => {
    const result = await analyticsService.GetSubscriptionTrends({
      range: "all",
      interval: "day",
      timeZone: "Europe/London",
    });
    expect(result).toEqual(expect.objectContaining({
      success: false,
      statusCode: 400,
    }));
    expect(result.message).toContain("monthly or yearly");
  });
});
