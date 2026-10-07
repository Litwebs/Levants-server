const mongoose = require("mongoose");
const analyticsService = require("../../services/analytics.admin.service");
const Product = require("../../models/product.model");
const Variant = require("../../models/variant.model");
const Subscription = require("../../models/subscription.model");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

const london = "Europe/London";
const paidAt = new Date("2026-06-11T12:00:00.000Z");
const refundedAt = new Date("2026-06-12T12:00:00.000Z");

const itemFor = ({
  product,
  variant,
  subtotal,
  quantity = 1,
  productName = product.name,
  variantName = variant.name,
  sku = variant.sku,
}) => ({
  product: product._id,
  productName,
  variant: variant._id,
  name: variantName,
  sku,
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
}

describe("analytics refund, cancellation, and deleted-catalog hardening", () => {
  test("counts collected states correctly while excluding cancelled/archived orders and non-succeeded refunds", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Edge Status Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

    const cases = [
      { status: "paid", total: 100, quantity: 1 },
      { status: "partially_paid", total: 100, amountPaid: 40, quantity: 4 },
      {
        status: "refund_pending",
        total: 50,
        quantity: 1,
        refunds: [{
          stripeRefundId: "re_edge_pending",
          currency: "GBP",
          amount: 10,
          amountMinor: 1000,
          status: "pending",
          refundedAt,
        }],
      },
      {
        status: "refund_failed",
        total: 60,
        quantity: 1,
        refunds: [{
          stripeRefundId: "re_edge_failed",
          currency: "GBP",
          amount: 10,
          amountMinor: 1000,
          status: "failed",
          refundedAt,
        }],
      },
      {
        status: "partially_refunded",
        total: 70,
        quantity: 1,
        refunds: [{
          stripeRefundId: "re_edge_partial",
          currency: "GBP",
          amount: 20,
          amountMinor: 2000,
          status: "succeeded",
          refundedAt,
        }],
      },
      {
        status: "refunded",
        total: 80,
        quantity: 1,
        refunds: [{
          stripeRefundId: "re_edge_full",
          currency: "GBP",
          amount: 80,
          amountMinor: 8000,
          status: "succeeded",
          refundedAt,
        }],
      },
    ];

    for (const entry of cases) {
      await createOrder({
        customer,
        status: entry.status,
        items: [itemFor({
          product,
          variant,
          subtotal: entry.total,
          quantity: entry.quantity,
        })],
        overrides: {
          subtotal: entry.total,
          total: entry.total,
          paidAt,
          ...(entry.amountPaid !== undefined
            ? { amountPaid: entry.amountPaid }
            : {}),
          ...(entry.refunds ? { refunds: entry.refunds } : {}),
        },
      });
    }

    await createOrder({
      customer,
      status: "cancelled",
      items: [itemFor({ product, variant, subtotal: 999 })],
      overrides: {
        subtotal: 999,
        total: 999,
        paidAt,
      },
    });
    await createOrder({
      customer,
      status: "paid",
      items: [itemFor({ product, variant, subtotal: 999 })],
      overrides: {
        subtotal: 999,
        total: 999,
        paidAt,
        archived: true,
        archivedAt: paidAt,
      },
    });

    const result = await analyticsService.GetPerformanceMetrics({
      from: "2026-06-10",
      to: "2026-06-12",
      timeZone: london,
    });

    expect(result).toEqual(
      expect.objectContaining({
        grossRevenue: 400,
        refundAmount: 100,
        netRevenue: 300,
        totalOrders: 6,
        unitsSold: 9,
      }),
    );
  });

  test("manual import precedence survives subscription markers, partial collection, and a later refund", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Imported Edge Product" });
    const variant = await createVariant({ product, price: 20, stock: 100 });

    await createOrder({
      customer,
      status: "partially_refunded",
      items: [itemFor({
        product,
        variant,
        subtotal: 80,
        quantity: 4,
      })],
      overrides: {
        subtotal: 80,
        total: 80,
        amountPaid: 30,
        paidAt,
        metadata: { manualImport: true },
        orderType: "subscription_generated",
        subscription: new mongoose.Types.ObjectId(),
        refunds: [{
          stripeRefundId: "re_imported_partial",
          currency: "GBP",
          amount: 10,
          amountMinor: 1000,
          status: "succeeded",
          refundedAt,
        }],
      },
    });

    const result = await analyticsService.GetSalesBreakdown({
      from: "2026-06-10",
      to: "2026-06-12",
      timeZone: london,
    });

    const imported = result.data.channels.find((row) => row.key === "imported");
    const subscription = result.data.channels.find(
      (row) => row.key === "subscription",
    );

    expect(imported).toEqual(
      expect.objectContaining({
        grossRevenue: 30,
        refundAmount: 10,
        netRevenue: 20,
        totalOrders: 1,
        unitsSold: 4,
      }),
    );
    expect(subscription).toEqual(
      expect.objectContaining({
        grossRevenue: 0,
        refundAmount: 0,
        netRevenue: 0,
        totalOrders: 0,
      }),
    );
  });

  test("unattributed refunds affect financial totals but never rewrite historical product/variant revenue or identity", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Current Catalog Product" });
    const variant = await createVariant({ product, price: 100, stock: 100 });

    await createOrder({
      customer,
      status: "partially_refunded",
      items: [itemFor({
        product,
        variant,
        subtotal: 100,
        productName: "Historical Deleted Product",
        variantName: "Historical Deleted Variant",
        sku: "DELETED-HIST",
      })],
      overrides: {
        subtotal: 100,
        total: 100,
        paidAt,
        refunds: [{
          stripeRefundId: "re_unattributed_catalog",
          currency: "GBP",
          amount: 20,
          amountMinor: 2000,
          status: "succeeded",
          refundedAt,
        }],
      },
    });

    await Product.updateOne(
      { _id: product._id },
      { $set: { name: "Renamed Current Product" } },
    );
    await Variant.updateOne(
      { _id: variant._id },
      { $set: { name: "Renamed Current Variant", sku: "RENAMED-NOW" } },
    );

    const renamedRanking = await analyticsService.GetTopProducts({
      from: "2026-06-10",
      to: "2026-06-12",
      timeZone: london,
    });
    expect(renamedRanking.data.byRevenue[0]).toEqual(
      expect.objectContaining({
        productName: "Historical Deleted Product",
        totalRevenue: 100,
        catalogStatus: "active",
      }),
    );

    await Variant.deleteOne({ _id: variant._id });
    await Product.deleteOne({ _id: product._id });

    const [financials, products, variants, productDetail, variantDetail, productTrends, variantTrends] =
      await Promise.all([
        analyticsService.GetPerformanceMetrics({
          from: "2026-06-10",
          to: "2026-06-12",
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
        analyticsService.GetProductDetail({
          productId: String(product._id),
          from: "2026-06-10",
          to: "2026-06-12",
          interval: "day",
          timeZone: london,
        }),
        analyticsService.GetVariantDetail({
          variantId: String(variant._id),
          from: "2026-06-10",
          to: "2026-06-12",
          interval: "day",
          timeZone: london,
        }),
        analyticsService.GetProductTrends({
          from: "2026-06-10",
          to: "2026-06-12",
          interval: "day",
          timeZone: london,
        }),
        analyticsService.GetVariantTrends({
          from: "2026-06-10",
          to: "2026-06-12",
          interval: "day",
          timeZone: london,
        }),
      ]);

    expect(financials).toEqual(
      expect.objectContaining({
        grossRevenue: 100,
        refundAmount: 20,
        netRevenue: 80,
      }),
    );
    expect(products.data.byRevenue[0]).toEqual(
      expect.objectContaining({
        productName: "Historical Deleted Product",
        catalogStatus: "deleted",
        totalRevenue: 100,
      }),
    );
    expect(variants.data.byRevenue[0]).toEqual(
      expect.objectContaining({
        variantName: "Historical Deleted Variant",
        sku: "DELETED-HIST",
        catalogStatus: "deleted",
        totalRevenue: 100,
      }),
    );
    expect(productDetail.data).toEqual(
      expect.objectContaining({
        productName: "Historical Deleted Product",
        catalogStatus: "deleted",
        totalRevenue: 100,
      }),
    );
    expect(variantDetail.data).toEqual(
      expect.objectContaining({
        productName: "Historical Deleted Product",
        variantName: "Historical Deleted Variant",
        sku: "DELETED-HIST",
        catalogStatus: "deleted",
        totalRevenue: 100,
      }),
    );
    expect(productTrends.data.products[0]).toEqual(
      expect.objectContaining({
        productName: "Historical Deleted Product",
        catalogStatus: "deleted",
        totalRevenue: 100,
      }),
    );
    expect(variantTrends.data.variants[0]).toEqual(
      expect.objectContaining({
        variantName: "Historical Deleted Variant",
        sku: "DELETED-HIST",
        catalogStatus: "deleted",
        totalRevenue: 100,
      }),
    );
  });

  test("scheduled cancellation stays active until finalized while only effective cancelledAt events count as cancellations", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Cancellation Edge Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

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

    const active = await analyticsService.GetActiveSubscriptions();
    const cancelled = await analyticsService.GetCancelledSubscriptions({
      from: "2026-06-10",
      to: "2026-06-12",
      timeZone: london,
    });

    expect(active.data.activeSubscriptions).toBe(2);
    expect(cancelled.data.cancelledSubscriptions).toBe(1);
  });
});
