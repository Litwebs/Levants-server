const analyticsService = require("../../services/analytics.admin.service");
const Order = require("../../models/order.model");
const Subscription = require("../../models/subscription.model");
const {
  parseDateRange,
} = require("../../utils/analyticsDate.util");
const {
  resolveComparisonPeriods,
} = require("../../utils/analyticsComparison.util");
const {
  buildExpectedSeriesLabels,
} = require("../../utils/analyticsRevenueSeries.util");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

const london = "Europe/London";

const itemFor = (product, variant, subtotal = 10, quantity = 1) => ({
  product: product._id,
  productName: product.name,
  variant: variant._id,
  name: variant.name,
  sku: variant.sku,
  price: subtotal / quantity,
  quantity,
  subtotal,
});

async function createSubscriptionAt({
  customer,
  product,
  variant,
  createdAt,
  status = "active",
  cancelledAt = null,
}) {
  const subscription = await Subscription.create({
    customer: customer._id,
    status,
    cancelledAt,
    frequency: "weekly",
    preferredDeliveryDay: 2,
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    nextDeliveryDate: new Date("2026-11-01T00:00:00.000Z"),
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
    { _id: subscription._id },
    {
      $set: {
        createdAt: new Date(createdAt),
        status,
        cancelledAt,
      },
    },
  );

  return subscription;
}

describe("analytics timezone boundary hardening", () => {
  test("uses inclusive London-local midnight bounds for paidAt, createdAt fallback, and refund events", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Timezone Boundary Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

    const createSale = (amount, paidAt) =>
      createOrder({
        customer,
        status: "paid",
        items: [itemFor(product, variant, amount)],
        overrides: {
          subtotal: amount,
          total: amount,
          paidAt: new Date(paidAt),
        },
      });

    await createSale(99, "2026-06-09T22:59:59.999Z");
    await createSale(10, "2026-06-09T23:00:00.000Z");
    await createSale(20, "2026-06-10T22:59:59.999Z");
    await createSale(99, "2026-06-10T23:00:00.000Z");

    const fallback = await createOrder({
      customer,
      status: "paid",
      items: [itemFor(product, variant, 30)],
      overrides: {
        subtotal: 30,
        total: 30,
        paidAt: null,
      },
    });
    await Order.collection.updateOne(
      { _id: fallback._id },
      {
        $set: {
          paidAt: null,
          createdAt: new Date("2026-06-10T12:00:00.000Z"),
        },
      },
    );

    await createOrder({
      customer,
      status: "partially_refunded",
      items: [itemFor(product, variant, 50)],
      overrides: {
        subtotal: 50,
        total: 50,
        paidAt: new Date("2026-06-01T12:00:00.000Z"),
        refunds: [
          {
            stripeRefundId: "re_tz_start",
            currency: "GBP",
            amount: 2,
            amountMinor: 200,
            status: "succeeded",
            refundedAt: new Date("2026-06-09T23:00:00.000Z"),
          },
          {
            stripeRefundId: "re_tz_end",
            currency: "GBP",
            amount: 3,
            amountMinor: 300,
            status: "succeeded",
            refundedAt: new Date("2026-06-10T22:59:59.999Z"),
          },
          {
            stripeRefundId: "re_tz_after",
            currency: "GBP",
            amount: 7,
            amountMinor: 700,
            status: "succeeded",
            refundedAt: new Date("2026-06-10T23:00:00.000Z"),
          },
          {
            stripeRefundId: "re_tz_pending",
            currency: "GBP",
            amount: 100,
            amountMinor: 10000,
            status: "pending",
            refundedAt: new Date("2026-06-10T12:00:00.000Z"),
          },
          {
            stripeRefundId: "re_tz_failed",
            currency: "GBP",
            amount: 100,
            amountMinor: 10000,
            status: "failed",
            refundedAt: new Date("2026-06-10T12:00:00.000Z"),
          },
          {
            stripeRefundId: "re_tz_created_fallback",
            currency: "GBP",
            amount: 5,
            amountMinor: 500,
            status: "succeeded",
            refundedAt: null,
            createdAt: new Date("2026-06-10T12:00:00.000Z"),
          },
        ],
      },
    });

    const result = await analyticsService.GetRevenueSeries({
      from: "2026-06-10",
      to: "2026-06-10",
      interval: "day",
      timeZone: london,
    });

    expect(result.success).toBe(true);
    expect(result.data.points).toEqual([
      {
        label: "2026-06-10",
        grossRevenue: 60,
        refunds: 10,
        netRevenue: 50,
        revenue: 50,
        orders: 3,
      },
    ]);
  });

  test("keeps calendar-day comparisons and zero-fill stable across both London DST transitions", () => {
    const spring = parseDateRange({
      from: "2026-03-28",
      to: "2026-03-30",
      timeZone: london,
    });
    const autumn = parseDateRange({
      from: "2026-10-24",
      to: "2026-10-26",
      timeZone: london,
    });

    expect(spring.end.getTime() - spring.start.getTime() + 1).toBe(
      71 * 60 * 60 * 1000,
    );
    expect(autumn.end.getTime() - autumn.start.getTime() + 1).toBe(
      73 * 60 * 60 * 1000,
    );

    expect(
      buildExpectedSeriesLabels({
        interval: "day",
        from: "2026-03-28",
        to: "2026-03-30",
        timeZone: london,
      }),
    ).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"]);
    expect(
      buildExpectedSeriesLabels({
        interval: "day",
        from: "2026-10-24",
        to: "2026-10-26",
        timeZone: london,
      }),
    ).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);

    const comparison = resolveComparisonPeriods({
      range: "custom",
      from: "2026-03-29",
      to: "2026-03-30",
      comparisonMode: "previous_period",
      timeZone: london,
    });

    expect(comparison.current).toEqual(
      expect.objectContaining({
        from: "2026-03-29",
        to: "2026-03-30",
        days: 2,
      }),
    );
    expect(comparison.previous).toEqual(
      expect.objectContaining({
        from: "2026-03-27",
        to: "2026-03-28",
        days: 2,
      }),
    );
    expect(comparison.current.start.toISOString()).toBe(
      "2026-03-29T00:00:00.000Z",
    );
    expect(comparison.current.end.toISOString()).toBe(
      "2026-03-30T22:59:59.999Z",
    );

    const leapYear = resolveComparisonPeriods({
      range: "custom",
      from: "2028-02-29",
      to: "2028-02-29",
      comparisonMode: "previous_year",
      timeZone: london,
    });
    expect(leapYear.previous).toEqual(
      expect.objectContaining({
        from: "2027-02-28",
        to: "2027-02-28",
        days: 1,
      }),
    );
  });

  test("dashboard product and variant trends keep the DST-start day in one local bucket and zero-fill adjacent days", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "DST Trend Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });
    const item = itemFor(product, variant, 10);

    for (const paidAt of [
      "2026-03-29T00:30:00.000Z",
      "2026-03-29T22:30:00.000Z",
    ]) {
      await createOrder({
        customer,
        status: "paid",
        items: [item],
        overrides: {
          subtotal: 10,
          total: 10,
          paidAt: new Date(paidAt),
        },
      });
    }

    const result = await analyticsService.GetDashboard({
      range: "custom",
      from: "2026-03-28",
      to: "2026-03-30",
      interval: "day",
      timeZone: london,
      comparison: "none",
    });

    expect(result.success).toBe(true);

    const website = result.data.salesTrends.channels.find(
      (channel) => channel.key === "website",
    );
    expect(website.points.map((point) => point.label)).toEqual([
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
    ]);
    expect(website.points.map((point) => point.grossRevenue)).toEqual([
      0,
      20,
      0,
    ]);

    const productTrend = result.data.productTrends.products.find(
      (row) => String(row.productId) === String(product._id),
    );
    expect(productTrend.points.map((point) => point.revenue)).toEqual([
      0,
      20,
      0,
    ]);

    const variantTrend = result.data.variantTrends.variants.find(
      (row) => String(row.variantId) === String(variant._id),
    );
    expect(variantTrend.points.map((point) => point.revenue)).toEqual([
      0,
      20,
      0,
    ]);
  });

  test("subscription acquisition and effective cancellation stay in the correct 25-hour London day", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "DST Subscription Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

    await createSubscriptionAt({
      customer,
      product,
      variant,
      createdAt: "2026-10-24T23:30:00.000Z",
    });
    await createSubscriptionAt({
      customer,
      product,
      variant,
      createdAt: "2026-10-01T12:00:00.000Z",
      status: "cancelled",
      cancelledAt: new Date("2026-10-25T23:30:00.000Z"),
    });

    const result = await analyticsService.GetSubscriptionTrends({
      from: "2026-10-24",
      to: "2026-10-26",
      interval: "day",
      timeZone: london,
    });

    expect(result.success).toBe(true);
    expect(result.data.points.map((point) => point.label)).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
    ]);
    expect(result.data.points[1]).toEqual(
      expect.objectContaining({
        label: "2026-10-25",
        newSubscriptions: 1,
        cancelledSubscriptions: 1,
      }),
    );
  });
});
