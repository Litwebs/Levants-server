const analyticsService = require("../../services/analytics.admin.service");
const Subscription = require("../../models/subscription.model");
const {
  createCustomer,
  createProduct,
  createVariant,
} = require("../Orders/helpers/orderFactory");

describe("analytics active subscriptions", () => {
  test("counts only subscriptions eligible to continue recurring service", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Subscription Analytics Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

    const createSubscription = (overrides = {}) =>
      Subscription.create({
        customer: customer._id,
        status: "active",
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
        ...overrides,
      });

    await createSubscription();
    await createSubscription({ isCancellationScheduled: false });
    await createSubscription({
      isCancellationScheduled: true,
      cancellationEffectiveAfter: new Date("2026-06-17T00:00:00.000Z"),
    });
    await createSubscription({
      status: "paused",
      pausedAt: new Date("2026-06-10T00:00:00.000Z"),
      pausedUntil: new Date("2026-06-24T00:00:00.000Z"),
      pauseReason: "customer",
    });
    await createSubscription({
      status: "cancelled",
      cancelledAt: new Date("2026-06-10T00:00:00.000Z"),
    });

    const result = await analyticsService.GetActiveSubscriptions();

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      activeSubscriptions: 3,
      metricBasis: {
        activeSubscriptions: expect.stringContaining(
          "Scheduled cancellations remain active",
        ),
        scope: expect.stringContaining("Point-in-time current state"),
      },
    });
  });

  test("returns a stable zero count when there are no recurring active subscriptions", async () => {
    const result = await analyticsService.GetActiveSubscriptions();

    expect(result).toEqual({
      success: true,
      data: {
        activeSubscriptions: 0,
        metricBasis: {
          activeSubscriptions: expect.any(String),
          scope: expect.any(String),
        },
      },
    });
  });
});
