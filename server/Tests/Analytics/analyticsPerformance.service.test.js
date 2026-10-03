const mongoose = require("mongoose");
const { performance } = require("node:perf_hooks");

const analyticsService = require("../../services/analytics.admin.service");
const Order = require("../../models/order.model");
const ProductVariant = require("../../models/variant.model");
const Subscription = require("../../models/subscription.model");
const {
  createCustomer,
  createProduct,
  createVariant,
} = require("../Orders/helpers/orderFactory");

const DAY_MS = 24 * 60 * 60 * 1000;
const ORDER_COUNT = 1000;
const DEFAULT_BUDGET_MS = 8000;

jest.setTimeout(60_000);

const makeOrder = ({
  index,
  customerId,
  productId,
  variantId,
  productName,
  variantName,
  sku,
}) => {
  const paidAt = new Date(Date.UTC(2026, 5, 1, 12) + (index % 30) * DAY_MS);
  const isImported = index % 5 === 0;
  const isSubscription = !isImported && index % 3 === 0;

  return {
    _id: new mongoose.Types.ObjectId(),
    orderId: `ORD-PERF-${String(index).padStart(5, "0")}`,
    customer: customerId,
    items: [
      {
        product: productId,
        productName,
        variant: variantId,
        name: variantName,
        sku,
        price: 10,
        quantity: 1,
        subtotal: 10,
      },
    ],
    currency: "GBP",
    subtotal: 10,
    deliveryAddress: {
      line1: "1 Performance Road",
      city: "Bradford",
      postcode: "BD1 1AA",
      country: "United Kingdom",
    },
    location: { lat: 53.7939, lng: -1.7521 },
    deliveryFee: 0,
    total: 10,
    status: "paid",
    deliveryStatus: "ordered",
    reservationExpiresAt: new Date("2027-01-01T00:00:00.000Z"),
    paidAt,
    metadata: isImported ? { manualImport: true } : {},
    archived: false,
    orderType: isImported || isSubscription ? "subscription_generated" : "one_time",
    subscription:
      isImported || isSubscription ? new mongoose.Types.ObjectId() : null,
    refunds: [],
    createdAt: paidAt,
    updatedAt: paidAt,
  };
};

describe("analytics dashboard performance budget", () => {
  test("keeps the 1,000-order dashboard within latency and scan budgets", async () => {
    const customer = await createCustomer();
    const catalog = [];

    for (let index = 0; index < 5; index += 1) {
      const product = await createProduct({
        name: `Performance Product ${index + 1}`,
        slug: `performance-product-${index + 1}`,
      });
      const variant = await createVariant({
        product,
        price: 10,
        stock: 1000,
      });
      catalog.push({ product, variant });
    }

    const orders = Array.from({ length: ORDER_COUNT }, (_, index) => {
      const entry = catalog[index % catalog.length];
      return makeOrder({
        index,
        customerId: customer._id,
        productId: entry.product._id,
        variantId: entry.variant._id,
        productName: entry.product.name,
        variantName: entry.variant.name,
        sku: entry.variant.sku,
      });
    });

    await Order.collection.insertMany(orders, { ordered: false });

    const params = {
      from: "2026-06-01",
      to: "2026-06-30",
      interval: "day",
      orderSource: "all",
      comparison: "none",
      timeZone: "Europe/London",
    };

    // Warm the in-memory database and aggregation engine before measuring.
    const warmup = await analyticsService.GetDashboard(params);
    expect(warmup.success).toBe(true);
    expect(warmup.data.overview.metrics.totalOrders).toBe(ORDER_COUNT);

    const orderAggregateSpy = jest.spyOn(Order, "aggregate");
    const orderFindSpy = jest.spyOn(Order, "find");
    const variantAggregateSpy = jest.spyOn(ProductVariant, "aggregate");
    const subscriptionAggregateSpy = jest.spyOn(Subscription, "aggregate");
    const subscriptionCountSpy = jest.spyOn(Subscription, "countDocuments");

    const startedAt = performance.now();
    const result = await analyticsService.GetDashboard(params);
    const elapsedMs = performance.now() - startedAt;

    expect(result.success).toBe(true);
    expect(result.data.overview.metrics).toEqual(
      expect.objectContaining({
        totalOrders: ORDER_COUNT,
        grossRevenue: ORDER_COUNT * 10,
        netRevenue: ORDER_COUNT * 10,
        unitsSold: ORDER_COUNT,
      }),
    );
    expect(result.data.topProducts.totals).toEqual(
      expect.objectContaining({
        totalRevenue: ORDER_COUNT * 10,
        totalUnits: ORDER_COUNT,
        productsSold: 5,
      }),
    );
    expect(result.data.revenue.points).toHaveLength(30);

    // Structural guard: the dashboard must remain a bounded set of aggregate
    // scans. Reductions are welcome; increases require deliberate review.
    expect(orderAggregateSpy.mock.calls.length).toBeLessThanOrEqual(13);
    expect(orderFindSpy.mock.calls.length).toBeLessThanOrEqual(1);
    expect(variantAggregateSpy.mock.calls.length).toBeLessThanOrEqual(1);
    expect(subscriptionAggregateSpy.mock.calls.length).toBeLessThanOrEqual(3);
    expect(subscriptionCountSpy.mock.calls.length).toBeLessThanOrEqual(2);

    const budgetMs = Number(
      process.env.ANALYTICS_PERF_BUDGET_MS || DEFAULT_BUDGET_MS,
    );
    expect(elapsedMs).toBeLessThan(budgetMs);
  });
});
