const analyticsService = require("../../services/analytics.admin.service");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("GetSummary", () => {
  test("counts active orders accurately and filters by order source", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 10, stock: 20 });

    const baseItem = {
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: variant.price,
      quantity: 1,
      subtotal: variant.price,
    };

    await createOrder({
      customer,
      status: "pending",
      items: [baseItem],
      overrides: { total: 10 },
    });

    await createOrder({
      customer,
      status: "unpaid",
      items: [baseItem],
      overrides: { total: 10 },
    });

    await createOrder({
      customer,
      status: "partially_refunded",
      items: [baseItem],
      overrides: { total: 10 },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [baseItem],
      overrides: {
        total: 25,
        metadata: { manualImport: true },
      },
    });

    await createOrder({
      customer,
      status: "cancelled",
      items: [baseItem],
      overrides: {
        total: 10,
        metadata: { manualImport: true },
      },
    });

    await createOrder({
      customer,
      status: "failed",
      items: [baseItem],
      overrides: {
        total: 10,
        archived: true,
        archivedAt: new Date(),
      },
    });

    const summary = await analyticsService.GetSummary({ range: "today" });
    const websiteSummary = await analyticsService.GetSummary({
      range: "today",
      orderSource: "website",
    });
    const importedSummary = await analyticsService.GetSummary({
      range: "today",
      orderSource: "imported",
    });

    expect(summary.success).toBe(true);
    expect(summary.data.totalOrders).toBe(5);
    expect(summary.data.pendingOrders).toBe(2);
    expect(summary.data.paidOrders).toBe(1);
    expect(summary.data.cancelledOrders).toBe(1);
    expect(summary.data.refundedOrders).toBe(1);
    expect(summary.data.failedOrders).toBe(0);
    expect(summary.data.totalRefunds).toBe(1);
    expect(summary.data.revenue).toBe(25);
    expect(summary.data.orderStatus).toEqual(
      expect.objectContaining({
        Pending: 2,
        Paid: 1,
        Cancelled: 1,
        Refunded: 1,
      }),
    );

    expect(websiteSummary.data.totalOrders).toBe(3);
    expect(websiteSummary.data.pendingOrders).toBe(2);
    expect(websiteSummary.data.paidOrders).toBe(0);
    expect(websiteSummary.data.refundedOrders).toBe(1);
    expect(websiteSummary.data.revenue).toBe(0);

    expect(importedSummary.data.totalOrders).toBe(2);
    expect(importedSummary.data.paidOrders).toBe(1);
    expect(importedSummary.data.cancelledOrders).toBe(1);
    expect(importedSummary.data.pendingOrders).toBe(0);
    expect(importedSummary.data.revenue).toBe(25);
  });
});
