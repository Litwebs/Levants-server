const analyticsService = require("../../services/analytics.admin.service");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics revenue composition", () => {
  test("separates merchandise, delivery, discounts and refunds on collected basis", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 10, stock: 100 });

    const item = (quantity) => ({
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: 10,
      quantity,
      subtotal: quantity * 10,
    });

    const paidAt = new Date("2026-06-11T12:00:00.000Z");
    const refundAt = new Date("2026-06-12T12:00:00.000Z");

    await createOrder({
      customer,
      status: "paid",
      items: [item(2)],
      overrides: {
        subtotal: 100,
        deliveryFee: 5,
        totalBeforeDiscount: 105,
        discountAmount: 10,
        isDiscounted: true,
        total: 95,
        paidAt,
      },
    });

    await createOrder({
      customer,
      status: "partially_paid",
      items: [item(4)],
      overrides: {
        subtotal: 80,
        deliveryFee: 4,
        totalBeforeDiscount: 84,
        discountAmount: 4,
        isDiscounted: true,
        total: 80,
        amountPaid: 40,
        paidAt,
        metadata: { manualImport: true },
      },
    });

    // Prior-period sale; only its refund belongs to the selected period.
    await createOrder({
      customer,
      status: "partially_refunded",
      items: [item(1)],
      overrides: {
        subtotal: 50,
        deliveryFee: 5,
        total: 55,
        paidAt: new Date("2026-06-01T12:00:00.000Z"),
        refunds: [
          {
            stripeRefundId: "re_composition",
            currency: "GBP",
            amount: 15,
            amountMinor: 1500,
            status: "succeeded",
            refundedAt: refundAt,
          },
        ],
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [item(1)],
      overrides: {
        subtotal: 500,
        deliveryFee: 50,
        discountAmount: 50,
        totalBeforeDiscount: 550,
        total: 500,
        paidAt,
        archived: true,
        archivedAt: paidAt,
      },
    });

    const result = await analyticsService.GetRevenueComposition({
      from: "2026-06-10",
      to: "2026-06-12",
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      merchandiseRevenue: 140,
      deliveryRevenue: 7,
      discountAmount: 12,
      discountedOrders: 2,
      averageDiscountPerDiscountedOrder: 6,
      discountRate: 8.16,
      preDiscountRevenue: 147,
      grossRevenue: 135,
      refundAmount: 15,
      netRevenue: 120,
    });

    // 140 merchandise + 7 delivery - 12 discounts = 135 collected gross.
    expect(
      result.data.merchandiseRevenue +
        result.data.deliveryRevenue -
        result.data.discountAmount,
    ).toBe(result.data.grossRevenue);
  });

  test("source filtering keeps partial-payment composition proportional", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 10, stock: 100 });

    await createOrder({
      customer,
      status: "partially_paid",
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: 10,
          quantity: 4,
          subtotal: 40,
        },
      ],
      overrides: {
        subtotal: 80,
        deliveryFee: 4,
        totalBeforeDiscount: 84,
        discountAmount: 4,
        isDiscounted: true,
        total: 80,
        amountPaid: 40,
        paidAt: new Date("2026-06-11T12:00:00.000Z"),
        metadata: { manualImport: true },
      },
    });

    const result = await analyticsService.GetRevenueComposition({
      from: "2026-06-10",
      to: "2026-06-12",
      orderSource: "imported",
      timeZone: "Europe/London",
    });

    expect(result.data).toEqual({
      merchandiseRevenue: 40,
      deliveryRevenue: 2,
      discountAmount: 2,
      discountedOrders: 1,
      averageDiscountPerDiscountedOrder: 2,
      discountRate: 4.76,
      preDiscountRevenue: 42,
      grossRevenue: 40,
      refundAmount: 0,
      netRevenue: 40,
    });
  });
});
