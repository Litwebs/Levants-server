"use strict";
const service = require("../../services/analytics.admin.service");
const { createCustomer, createProduct, createVariant, createOrder } = require("../Orders/helpers/orderFactory");

const refund = (id, amountMinor, status = "succeeded") => ({ stripeRefundId: id, amountMinor, amount: amountMinor / 100, status });
test.each([
  ["subscription card refund", { status: "partially_refunded", orderType: "subscription_generated", total: 61, amountPaid: 61, paymentAllocations: [{ paymentIntentId: "pi", source: "subscription_invoice", amountMinor: 7300 }], refunds: [refund("re", 1200)] }, 61],
  ["subscription store credit", { status: "partially_refunded", orderType: "subscription_generated", total: 61, amountPaid: 61, paymentAllocations: [{ paymentIntentId: "pi", source: "subscription_invoice", amountMinor: 7300 }] }, 61],
  ["ordinary partial refund with duplicate ledger", { status: "partially_refunded", total: 73, amountPaid: 73, refunds: [refund("re", 1200), refund("re", 1200), refund("pending", 500, "pending"), refund("failed", 500, "failed")] }, 61],
  ["legacy subscription without allocations", { status: "partially_refunded", orderType: "subscription_generated", total: 61, amountPaid: 61, refunds: [refund("re", 1200)] }, 61],
  ["partial capture", { status: "partially_paid", total: 73, amountPaid: 32 }, 32],
  ["legacy paid total", { status: "paid", total: 13 }, 13],
  ["refund awaiting confirmation", { status: "refund_pending", total: 73, amountPaid: 73, refunds: [refund("pending", 1200, "pending")] }, 73],
  ["full return after increment", { status: "refunded", total: 25, amountPaid: 25, refunds: [refund("re", 3700)] }, 0],
  ["unpaid", { status: "unpaid", total: 73 }, 0],
  ["zero-decimal currency", { status: "partially_refunded", currency: "JPY", total: 73, amountPaid: 73, refunds: [refund("re", 12)] }, 61],
])("all dashboard revenue surfaces retain the correct net value: %s", async (_, overrides, expected) => {
  const customer = await createCustomer(), product = await createProduct();
  const variant = await createVariant({ product, price: 73 });
  await createOrder({ customer, status: overrides.status, items: [{ product: product._id, variant: variant._id, name: variant.name, sku: variant.sku, price: 73, quantity: 1, subtotal: 73 }], overrides });
  const summary = await service.GetSummary({ range: "today" });
  const series = await service.GetRevenueSeries({ range: "today", interval: "day" });
  const overview = await service.GetRevenueOverview({ days: 7 });
  expect(summary.data.revenue).toBe(expected);
  expect(series.data.points.reduce((n, row) => n + row.revenue, 0)).toBe(expected);
  expect(overview.data.points.reduce((n, row) => n + row.revenue, 0)).toBe(expected);
  expect((await service.GetSummary({ range: "today", orderSource: "imported" })).data.revenue).toBe(0);
});

test("subscription net settlement preserves separate sale and refund event dates", async () => {
  const customer = await createCustomer(), product = await createProduct();
  const variant = await createVariant({ product, price: 73 });
  await createOrder({ customer, status: "partially_refunded",
    items: [{ product: product._id, variant: variant._id, name: variant.name, sku: variant.sku, price: 73, quantity: 1, subtotal: 73 }],
    overrides: { subtotal: 73, total: 61, amountPaid: 61, orderType: "subscription_generated",
      paidAt: new Date("2026-06-10T12:00:00Z"),
      paymentAllocations: [{ paymentIntentId: "pi_event", source: "subscription_invoice", amountMinor: 7300 }],
      refunds: [{ ...refund("re_event", 1200), refundedAt: new Date("2026-06-12T12:00:00Z") }],
    },
  });
  const result = await service.GetRevenueSeries({ from: "2026-06-10", to: "2026-06-12", interval: "day", timeZone: "Europe/London" });
  expect(result.data.points.find(point => point.label === "2026-06-10")).toMatchObject({ grossRevenue: 73, refunds: 0, netRevenue: 73 });
  expect(result.data.points.find(point => point.label === "2026-06-12")).toMatchObject({ grossRevenue: 0, refunds: 12, netRevenue: -12 });
  expect(result.data.points.reduce((sum, point) => sum + point.netRevenue, 0)).toBe(61);
});
