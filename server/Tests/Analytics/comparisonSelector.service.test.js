const analyticsService = require("../../services/analytics.admin.service");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("analytics comparison selector", () => {
  test("compares the selected period with the same dates in the previous year", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Comparison Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

    const item = {
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: 10,
      quantity: 1,
      subtotal: 10,
    };

    await createOrder({
      customer,
      status: "paid",
      items: [item],
      overrides: {
        subtotal: 100,
        total: 100,
        paidAt: new Date("2026-06-10T12:00:00.000Z"),
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [item],
      overrides: {
        subtotal: 40,
        total: 40,
        paidAt: new Date("2025-06-10T12:00:00.000Z"),
      },
    });

    await createOrder({
      customer,
      status: "paid",
      items: [item],
      overrides: {
        subtotal: 25,
        total: 25,
        paidAt: new Date("2026-06-09T12:00:00.000Z"),
      },
    });

    const result = await analyticsService.GetSummaryComparison({
      from: "2026-06-10",
      to: "2026-06-10",
      comparison: "previous_year",
      timeZone: "Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        available: true,
        strategy: "previous_year",
        currentPeriod: expect.objectContaining({
          from: "2026-06-10",
          to: "2026-06-10",
        }),
        previousPeriod: expect.objectContaining({
          from: "2025-06-10",
          to: "2025-06-10",
        }),
        current: expect.objectContaining({ netRevenue: 100 }),
        previous: expect.objectContaining({ netRevenue: 40 }),
      }),
    );
    expect(result.data.changes.netRevenue).toEqual(
      expect.objectContaining({
        current: 100,
        previous: 40,
        absoluteChange: 60,
        percentChange: 150,
        direction: "up",
      }),
    );
  });

  test("none suppresses comparison and invalid modes fail at the service boundary", async () => {
    const disabled = await analyticsService.GetSummaryComparison({
      from: "2026-06-10",
      to: "2026-06-12",
      comparison: "none",
      timeZone: "Europe/London",
    });

    expect(disabled.success).toBe(true);
    expect(disabled.data).toEqual(
      expect.objectContaining({
        available: false,
        reason: "comparison_disabled",
        strategy: "none",
        previousPeriod: null,
        previous: null,
        changes: null,
      }),
    );

    const invalid = await analyticsService.GetSummaryComparison({
      from: "2026-06-10",
      to: "2026-06-12",
      comparison: "something_else",
      timeZone: "Europe/London",
    });

    expect(invalid).toEqual({
      success: false,
      statusCode: 400,
      message:
        "Analytics comparison must be previous_period, previous_year, or none.",
    });
  });
});
