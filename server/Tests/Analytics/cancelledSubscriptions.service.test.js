const analyticsService = require("../../services/analytics.admin.service");
const Subscription = require("../../models/subscription.model");
const {
  createCustomer,
  createProduct,
  createVariant,
} = require("../Orders/helpers/orderFactory");

describe("analytics cancelled subscriptions", () => {
  async function createSubscription({
    customer,
    product,
    variant,
    status = "active",
    cancelledAt = null,
    isCancellationScheduled = false,
  }) {
    const subscription = await Subscription.create({
      customer: customer._id,
      status,
      cancelledAt,
      isCancellationScheduled,
      cancellationEffectiveAfter: isCancellationScheduled
        ? new Date("2026-06-11T12:00:00.000Z")
        : null,
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

    if (cancelledAt) {
      await Subscription.collection.updateOne(
        { _id: subscription._id },
        { $set: { cancelledAt: new Date(cancelledAt), status: "cancelled" } },
      );
    }

    return subscription;
  }

  test("counts effective cancellations by London-local cancelledAt and excludes scheduled cancellations", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Cancellation Analytics Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

    await createSubscription({
      customer,
      product,
      variant,
      cancelledAt: "2026-06-09T23:30:00.000Z",
    });
    await createSubscription({
      customer,
      product,
      variant,
      cancelledAt: "2026-06-10T12:00:00.000Z",
    });
    await createSubscription({
      customer,
      product,
      variant,
      cancelledAt: "2026-06-10T22:59:59.000Z",
    });
    await createSubscription({
      customer,
      product,
      variant,
      cancelledAt: "2026-06-10T23:00:00.000Z",
    });

    await createSubscription({
      customer,
      product,
      variant,
      status: "active",
      cancelledAt: null,
      isCancellationScheduled: true,
    });

    // Legacy/malformed cancelled rows without an effective timestamp must not
    // be invented into an all-time cancellation event count.
    await createSubscription({
      customer,
      product,
      variant,
      status: "cancelled",
      cancelledAt: null,
    });

    const result = await analyticsService.GetCancelledSubscriptions({
      from: "2026-06-10",
      to: "2026-06-10",
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      cancelledSubscriptions: 3,
      period: {
        from: "2026-06-10",
        to: "2026-06-10",
        timeZone: "Europe/London",
      },
      metricBasis: {
        cancelledSubscriptions: expect.stringContaining(
          "Scheduled cancellations are excluded until they become effective",
        ),
        source: expect.stringContaining("Order-source filters do not apply"),
      },
    });

    const allTime = await analyticsService.GetCancelledSubscriptions({
      range: "all",
      timeZone: "Europe/London",
    });
    expect(allTime.data.cancelledSubscriptions).toBe(4);
    expect(allTime.data.period).toBeNull();
  });

  test("rejects invalid service-level date ranges", async () => {
    const result = await analyticsService.GetCancelledSubscriptions({
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
