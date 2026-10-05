const mongoose = require("mongoose");
const analyticsService = require("../../services/analytics.admin.service");
const Order = require("../../models/order.model");
const Subscription = require("../../models/subscription.model");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

const london = "Europe/London";
const rangeStart = new Date("2026-06-09T23:00:00.000Z");
const rangeEnd = new Date("2026-06-12T22:59:59.999Z");

const collectedStatuses = new Set([
  "paid",
  "partially_paid",
  "refund_pending",
  "partially_refunded",
  "refunded",
  "refund_failed",
]);

const inRange = (value) => {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= rangeStart.getTime() && time <= rangeEnd.getTime();
};

const channelFor = (order) => {
  if (order?.metadata?.manualImport === true) return "imported";
  if (
    order?.orderType === "subscription_generated" ||
    order?.subscription != null
  ) {
    return "subscription";
  }
  return "website";
};

const collectedAmount = (order) => {
  if (order.amountPaid != null) return Number(order.amountPaid) || 0;
  if (order.status === "partially_paid") return 0;
  return Number(order.total) || 0;
};

const refundAmount = (refund, orderCurrency = "GBP") => {
  if (refund.amount != null) return Number(refund.amount) || 0;

  const currency = String(refund.currency || orderCurrency || "GBP").toUpperCase();
  const zeroDecimal = new Set([
    "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG",
    "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
  ]);
  const minor = Number(refund.amountMinor) || 0;
  return zeroDecimal.has(currency) ? minor : minor / 100;
};

const reconcileOrders = (orders) => {
  const totals = {
    grossRevenue: 0,
    refunds: 0,
    netRevenue: 0,
    orders: 0,
    units: 0,
    productRevenue: 0,
    variantRevenue: 0,
  };
  const channels = {
    website: { grossRevenue: 0, refunds: 0, netRevenue: 0, orders: 0, units: 0 },
    subscription: { grossRevenue: 0, refunds: 0, netRevenue: 0, orders: 0, units: 0 },
    imported: { grossRevenue: 0, refunds: 0, netRevenue: 0, orders: 0, units: 0 },
  };
  const byDay = new Map([
    ["2026-06-10", { grossRevenue: 0, refunds: 0, orders: 0 }],
    ["2026-06-11", { grossRevenue: 0, refunds: 0, orders: 0 }],
    ["2026-06-12", { grossRevenue: 0, refunds: 0, orders: 0 }],
  ]);

  const dayFor = (date) => {
    const time = new Date(date).getTime();
    if (
      time >= new Date("2026-06-09T23:00:00.000Z").getTime() &&
      time < new Date("2026-06-10T23:00:00.000Z").getTime()
    ) return "2026-06-10";
    if (
      time >= new Date("2026-06-10T23:00:00.000Z").getTime() &&
      time < new Date("2026-06-11T23:00:00.000Z").getTime()
    ) return "2026-06-11";
    if (
      time >= new Date("2026-06-11T23:00:00.000Z").getTime() &&
      time <= rangeEnd.getTime()
    ) return "2026-06-12";
    return null;
  };

  for (const order of orders) {
    if (order.archived === true) continue;

    const channel = channelFor(order);
    const effectivePaidAt = order.paidAt || order.createdAt;
    const isCollectedSale =
      collectedStatuses.has(order.status) && inRange(effectivePaidAt);

    if (isCollectedSale) {
      const gross = collectedAmount(order);
      const units = (order.items || []).reduce(
        (sum, item) => sum + (Number(item.quantity) || 0),
        0,
      );

      totals.grossRevenue += gross;
      totals.orders += 1;
      totals.units += units;
      channels[channel].grossRevenue += gross;
      channels[channel].orders += 1;
      channels[channel].units += units;

      const label = dayFor(effectivePaidAt);
      if (label) {
        byDay.get(label).grossRevenue += gross;
        byDay.get(label).orders += 1;
      }

      const orderTotal = Number(order.total) || 0;
      const fraction =
        orderTotal > 0
          ? Math.min(1, Math.max(0, gross / orderTotal))
          : 1;
      const orderSubtotal = Number(order.subtotal) || 0;
      const collectedMerchandise = orderSubtotal * fraction;
      const collectedDiscount = (Number(order.discountAmount) || 0) * fraction;
      const netMerchandise = Math.max(
        0,
        collectedMerchandise - collectedDiscount,
      );

      for (const item of order.items || []) {
        const lineSubtotal = Number(item.subtotal) || 0;
        const lineRevenue =
          orderSubtotal > 0
            ? (lineSubtotal / orderSubtotal) * netMerchandise
            : 0;
        totals.productRevenue += lineRevenue;
        totals.variantRevenue += lineRevenue;
      }
    }

    const succeededRefunds = (order.refunds || []).filter(
      (refund) => refund.status === "succeeded",
    );

    for (const refund of succeededRefunds) {
      const eventAt = refund.refundedAt || refund.createdAt;
      if (!inRange(eventAt)) continue;

      const amount = refundAmount(refund, order.currency);
      totals.refunds += amount;
      channels[channel].refunds += amount;

      const label = dayFor(eventAt);
      if (label) byDay.get(label).refunds += amount;
    }

    if (
      order.status === "refunded" &&
      succeededRefunds.length === 0 &&
      inRange(order?.refund?.refundedAt)
    ) {
      const amount = collectedAmount(order);
      totals.refunds += amount;
      channels[channel].refunds += amount;

      const label = dayFor(order.refund.refundedAt);
      if (label) byDay.get(label).refunds += amount;
    }
  }

  totals.netRevenue = totals.grossRevenue - totals.refunds;
  for (const row of Object.values(channels)) {
    row.netRevenue = row.grossRevenue - row.refunds;
  }

  return { totals, channels, byDay };
};

const makeItem = (product, variant, subtotal, quantity = 1) => ({
  product: product._id,
  productName: product.name,
  variant: variant._id,
  name: variant.name,
  sku: variant.sku,
  price: subtotal / quantity,
  quantity,
  subtotal,
});

async function createSubscription({
  customer,
  product,
  variant,
  status = "active",
  cancelledAt = null,
  isCancellationScheduled = false,
}) {
  return Subscription.create({
    customer: customer._id,
    status,
    cancelledAt,
    isCancellationScheduled,
    cancellationEffectiveAfter: isCancellationScheduled
      ? new Date("2026-06-17T00:00:00.000Z")
      : null,
    frequency: "weekly",
    preferredDeliveryDay: 2,
    startDate: new Date("2026-06-01T00:00:00.000Z"),
    nextDeliveryDate:
      status === "cancelled" ? null : new Date("2026-06-17T00:00:00.000Z"),
    deliveryAddress: {
      line1: "1 Reconciliation Road",
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
}

describe("analytics database reconciliation", () => {
  test("analytics totals reconcile to independent reads of persisted order and subscription documents", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Reconciliation Product" });
    const variant = await createVariant({ product, price: 50, stock: 100 });

    await createOrder({
      customer,
      status: "paid",
      items: [makeItem(product, variant, 100, 2)],
      overrides: {
        subtotal: 100,
        deliveryFee: 10,
        totalBeforeDiscount: 110,
        discountAmount: 10,
        isDiscounted: true,
        total: 100,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
      },
    });

    await createOrder({
      customer,
      status: "partially_paid",
      items: [makeItem(product, variant, 60, 3)],
      overrides: {
        subtotal: 60,
        total: 60,
        amountPaid: 30,
        paidAt: new Date("2026-06-11T12:30:00.000Z"),
        orderType: "subscription_generated",
        subscription: new mongoose.Types.ObjectId(),
      },
    });

    await createOrder({
      customer,
      status: "partially_refunded",
      items: [makeItem(product, variant, 40, 4)],
      overrides: {
        subtotal: 40,
        total: 40,
        amountPaid: 40,
        paidAt: new Date("2026-06-11T13:00:00.000Z"),
        metadata: { manualImport: true },
        refunds: [{
          stripeRefundId: "re_reconcile_imported",
          currency: "GBP",
          amount: 8,
          amountMinor: 800,
          status: "succeeded",
          refundedAt: new Date("2026-06-12T12:00:00.000Z"),
        }],
      },
    });

    await createOrder({
      customer,
      status: "refund_pending",
      items: [makeItem(product, variant, 20)],
      overrides: {
        subtotal: 20,
        total: 20,
        paidAt: new Date("2026-06-11T14:00:00.000Z"),
        refunds: [{
          stripeRefundId: "re_reconcile_pending",
          currency: "GBP",
          amount: 10,
          amountMinor: 1000,
          status: "pending",
          refundedAt: new Date("2026-06-12T12:10:00.000Z"),
        }],
      },
    });

    await createOrder({
      customer,
      status: "refunded",
      items: [makeItem(product, variant, 50)],
      overrides: {
        subtotal: 50,
        total: 50,
        paidAt: new Date("2026-06-11T15:00:00.000Z"),
        refunds: [{
          stripeRefundId: "re_reconcile_full",
          currency: "GBP",
          amount: 50,
          amountMinor: 5000,
          status: "succeeded",
          refundedAt: new Date("2026-06-12T12:20:00.000Z"),
        }],
      },
    });

    await createOrder({
      customer,
      status: "partially_refunded",
      items: [makeItem(product, variant, 25)],
      overrides: {
        subtotal: 25,
        total: 25,
        paidAt: new Date("2026-06-01T12:00:00.000Z"),
        refunds: [{
          stripeRefundId: "re_reconcile_old_sale",
          currency: "GBP",
          amount: 5,
          amountMinor: 500,
          status: "succeeded",
          refundedAt: new Date("2026-06-12T12:30:00.000Z"),
        }],
      },
    });

    await createOrder({
      customer,
      status: "refunded",
      items: [makeItem(product, variant, 30)],
      overrides: {
        subtotal: 30,
        total: 30,
        paidAt: new Date("2026-06-01T13:00:00.000Z"),
        refund: {
          refundedAt: new Date("2026-06-12T12:40:00.000Z"),
          reason: "legacy reconciliation fixture",
        },
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [makeItem(product, variant, 999)],
      overrides: {
        subtotal: 999,
        total: 999,
        paidAt: new Date("2026-06-11T16:00:00.000Z"),
        archived: true,
        archivedAt: new Date("2026-06-11T16:01:00.000Z"),
      },
    });

    await createOrder({
      customer,
      status: "cancelled",
      items: [makeItem(product, variant, 999)],
      overrides: {
        subtotal: 999,
        total: 999,
        paidAt: new Date("2026-06-11T17:00:00.000Z"),
      },
    });

    await createSubscription({ customer, product, variant });
    await createSubscription({
      customer,
      product,
      variant,
      isCancellationScheduled: true,
    });
    await createSubscription({
      customer,
      product,
      variant,
      status: "paused",
    });
    await createSubscription({
      customer,
      product,
      variant,
      status: "cancelled",
      cancelledAt: new Date("2026-06-11T12:00:00.000Z"),
    });

    const persistedOrders = await Order.find({}).lean();
    const oracle = reconcileOrders(persistedOrders);

    expect(oracle.totals).toEqual({
      grossRevenue: 240,
      refunds: 93,
      netRevenue: 147,
      orders: 5,
      units: 11,
      productRevenue: 230,
      variantRevenue: 230,
    });
    expect(oracle.channels).toEqual({
      website: {
        grossRevenue: 170,
        refunds: 85,
        netRevenue: 85,
        orders: 3,
        units: 4,
      },
      subscription: {
        grossRevenue: 30,
        refunds: 0,
        netRevenue: 30,
        orders: 1,
        units: 3,
      },
      imported: {
        grossRevenue: 40,
        refunds: 8,
        netRevenue: 32,
        orders: 1,
        units: 4,
      },
    });

    const [
      performance,
      breakdown,
      series,
      products,
      variants,
      activeSubscriptions,
      cancelledSubscriptions,
    ] = await Promise.all([
      analyticsService.GetPerformanceMetrics({
        from: "2026-06-10",
        to: "2026-06-12",
        timeZone: london,
      }),
      analyticsService.GetSalesBreakdown({
        from: "2026-06-10",
        to: "2026-06-12",
        timeZone: london,
      }),
      analyticsService.GetRevenueSeries({
        from: "2026-06-10",
        to: "2026-06-12",
        interval: "day",
        timeZone: london,
      }),
      analyticsService.GetTopProducts({
        from: "2026-06-10",
        to: "2026-06-12",
        timeZone: london,
      }),
      analyticsService.GetVariantRevenue({
        from: "2026-06-10",
        to: "2026-06-12",
        timeZone: london,
      }),
      analyticsService.GetActiveSubscriptions(),
      analyticsService.GetCancelledSubscriptions({
        from: "2026-06-10",
        to: "2026-06-12",
        timeZone: london,
      }),
    ]);

    expect(performance).toEqual(
      expect.objectContaining({
        grossRevenue: oracle.totals.grossRevenue,
        refundAmount: oracle.totals.refunds,
        netRevenue: oracle.totals.netRevenue,
        totalOrders: oracle.totals.orders,
        unitsSold: oracle.totals.units,
      }),
    );

    const channelRows = new Map(
      breakdown.data.channels.map((row) => [row.key, row]),
    );
    for (const [key, expected] of Object.entries(oracle.channels)) {
      expect(channelRows.get(key)).toEqual(
        expect.objectContaining({
          grossRevenue: expected.grossRevenue,
          refundAmount: expected.refunds,
          netRevenue: expected.netRevenue,
          totalOrders: expected.orders,
          unitsSold: expected.units,
        }),
      );
    }

    expect(series.data.totals).toEqual({
      grossRevenue: oracle.totals.grossRevenue,
      refunds: oracle.totals.refunds,
      netRevenue: oracle.totals.netRevenue,
      revenue: oracle.totals.netRevenue,
      orders: oracle.totals.orders,
    });
    expect(series.data.points).toEqual([
      {
        label: "2026-06-10",
        grossRevenue: 0,
        refunds: 0,
        netRevenue: 0,
        revenue: 0,
        orders: 0,
      },
      {
        label: "2026-06-11",
        grossRevenue: oracle.byDay.get("2026-06-11").grossRevenue,
        refunds: 0,
        netRevenue: oracle.byDay.get("2026-06-11").grossRevenue,
        revenue: oracle.byDay.get("2026-06-11").grossRevenue,
        orders: oracle.byDay.get("2026-06-11").orders,
      },
      {
        label: "2026-06-12",
        grossRevenue: 0,
        refunds: oracle.byDay.get("2026-06-12").refunds,
        netRevenue: -oracle.byDay.get("2026-06-12").refunds,
        revenue: -oracle.byDay.get("2026-06-12").refunds,
        orders: 0,
      },
    ]);

    expect(products.data.totals).toEqual({
      totalRevenue: oracle.totals.productRevenue,
      totalUnits: oracle.totals.units,
      productsSold: 1,
    });
    expect(products.data.byRevenue[0]).toEqual(
      expect.objectContaining({
        productId: product._id,
        totalRevenue: oracle.totals.productRevenue,
        totalQuantity: oracle.totals.units,
      }),
    );

    expect(variants.data.totals).toEqual({
      totalRevenue: oracle.totals.variantRevenue,
      variantsSold: 1,
    });
    expect(variants.data.byRevenue[0]).toEqual(
      expect.objectContaining({
        variantId: variant._id,
        totalRevenue: oracle.totals.variantRevenue,
        totalUnits: oracle.totals.units,
      }),
    );

    const persistedSubscriptions = await Subscription.find({}).lean();
    const expectedActiveSubscriptions = persistedSubscriptions.filter(
      (subscription) => subscription.status === "active",
    ).length;
    const expectedCancelledSubscriptions = persistedSubscriptions.filter(
      (subscription) =>
        subscription.status === "cancelled" &&
        inRange(subscription.cancelledAt),
    ).length;

    expect(activeSubscriptions.data.activeSubscriptions).toBe(
      expectedActiveSubscriptions,
    );
    expect(cancelledSubscriptions.data.cancelledSubscriptions).toBe(
      expectedCancelledSubscriptions,
    );
  });
});
