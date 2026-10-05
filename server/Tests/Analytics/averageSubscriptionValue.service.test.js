const analyticsService = require("../../services/analytics.admin.service");
const Subscription = require("../../models/subscription.model");
const {
  createCustomer,
  createProduct,
  createVariant,
} = require("../Orders/helpers/orderFactory");

describe("analytics average subscription value", () => {
  test("uses current recurring-active subscription snapshots and billing delivery fees", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Average Subscription Product" });
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
        items: [{
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          quantity: 2,
          unitPrice: 10,
        }],
        ...overrides,
      });

    await createSubscription();

    await createSubscription({
      preferredDeliveryDays: [2, 4],
      items: [{
        product: product._id,
        variant: variant._id,
        name: variant.name,
        sku: variant.sku,
        quantity: 3,
        unitPrice: 5,
      }],
      pendingChanges: {
        items: [{
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          quantity: 10,
          unitPrice: 100,
        }],
        effectiveFrom: new Date("2026-06-18T00:00:00.000Z"),
      },
    });

    await createSubscription({
      isCancellationScheduled: true,
      cancellationEffectiveAfter: new Date("2026-06-17T00:00:00.000Z"),
      items: [{
        product: product._id,
        variant: variant._id,
        name: variant.name,
        sku: variant.sku,
        quantity: 50,
        unitPrice: 50,
      }],
    });

    await createSubscription({
      status: "paused",
      pausedAt: new Date("2026-06-10T00:00:00.000Z"),
      pausedUntil: new Date("2026-06-24T00:00:00.000Z"),
      pauseReason: "customer",
      items: [{
        product: product._id,
        variant: variant._id,
        name: variant.name,
        sku: variant.sku,
        quantity: 50,
        unitPrice: 50,
      }],
    });

    const result = await analyticsService.GetAverageSubscriptionValue();

    expect(result.success).toBe(true);
    expect(result.data.activeSubscriptions).toBe(3);
    expect(result.data.totalRecurringCharge).toBe(2539);
    expect(result.data.averageMerchandiseValue).toBe(845);
    expect(result.data.averageDeliveryFeeValue).toBeCloseTo(4 / 3);
    expect(result.data.averageSubscriptionValue).toBeCloseTo(2539 / 3);
    expect(result.data.metricBasis).toEqual({
      averageSubscriptionValue: expect.stringContaining(
        "average recurring charge per billing cycle",
      ),
      scope: expect.stringContaining(
        "scheduled cancellations remain included while lifecycle status is active",
      ),
    });

    const active = await analyticsService.GetActiveSubscriptions();
    expect(active.data.activeSubscriptions).toBe(3);
  });

  test("returns a stable zero shape when no subscription is recurring-active", async () => {
    const result = await analyticsService.GetAverageSubscriptionValue();

    expect(result).toEqual({
      success: true,
      data: {
        averageSubscriptionValue: 0,
        averageMerchandiseValue: 0,
        averageDeliveryFeeValue: 0,
        totalRecurringCharge: 0,
        activeSubscriptions: 0,
        metricBasis: {
          averageSubscriptionValue: expect.any(String),
          scope: expect.any(String),
        },
      },
    });
  });
});
