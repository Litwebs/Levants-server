const analyticsService = require("../../services/analytics.admin.service");
const Subscription = require("../../models/subscription.model");
const {
  createCustomer,
  createProduct,
  createVariant,
} = require("../Orders/helpers/orderFactory");

describe("analytics new subscriptions", () => {
  async function createSubscriptionAt({
    customer,
    product,
    variant,
    createdAt,
    status = "active",
  }) {
    const subscription = await Subscription.create({
      customer: customer._id,
      status,
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
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          quantity: 1,
          unitPrice: 10,
        },
      ],
    });

    await Subscription.collection.updateOne(
      { _id: subscription._id },
      { $set: { createdAt: new Date(createdAt) } },
    );

    return subscription;
  }

  test("counts creation events in the selected London date range regardless of current status", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "New Subscription Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

    // Europe/London is BST (+01:00) in June:
    // 23:30 UTC on June 9 is 00:30 local on June 10 and must be included.
    await createSubscriptionAt({
      customer,
      product,
      variant,
      createdAt: "2026-06-09T23:30:00.000Z",
      status: "active",
    });
    await createSubscriptionAt({
      customer,
      product,
      variant,
      createdAt: "2026-06-10T12:00:00.000Z",
      status: "paused",
    });
    await createSubscriptionAt({
      customer,
      product,
      variant,
      createdAt: "2026-06-10T22:59:59.000Z",
      status: "cancelled",
    });

    // 23:00 UTC is midnight June 11 in London and must be excluded.
    await createSubscriptionAt({
      customer,
      product,
      variant,
      createdAt: "2026-06-10T23:00:00.000Z",
      status: "active",
    });
    await createSubscriptionAt({
      customer,
      product,
      variant,
      createdAt: "2026-06-09T22:59:59.000Z",
      status: "active",
    });

    const result = await analyticsService.GetNewSubscriptions({
      from: "2026-06-10",
      to: "2026-06-10",
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      newSubscriptions: 3,
      period: {
        from: "2026-06-10",
        to: "2026-06-10",
        timeZone: "Europe/London",
      },
      metricBasis: {
        newSubscriptions: expect.stringContaining(
          "regardless of their current lifecycle status",
        ),
        source: expect.stringContaining("Order-source filters do not apply"),
      },
    });

    const allTime = await analyticsService.GetNewSubscriptions({
      range: "all",
      timeZone: "Europe/London",
    });
    expect(allTime.data.newSubscriptions).toBe(5);
    expect(allTime.data.period).toBeNull();
  });

  test("rejects an invalid direct-service date range instead of widening it to all time", async () => {
    const result = await analyticsService.GetNewSubscriptions({
      from: "2026-02-30",
      to: "2026-03-01",
      timeZone: "Europe/London",
    });

    expect(result).toEqual({
      success: false,
      statusCode: 400,
      message: "Invalid analytics date range.",
    });
  });
});
