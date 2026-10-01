const {
  COLLECTED_ORDER_STATUSES,
  buildSalesOrderMatch,
} = require("../../utils/analyticsMetric.util");
const {
  buildOrderSourceMatch,
} = require("../../utils/analyticsFilter.util");

describe("analytics metric/source foundation", () => {
  test("collected statuses retain gross sales after refund state changes", () => {
    expect(COLLECTED_ORDER_STATUSES).toEqual(
      expect.arrayContaining([
        "paid",
        "partially_paid",
        "refund_pending",
        "partially_refunded",
        "refunded",
        "refund_failed",
      ]),
    );
    expect(COLLECTED_ORDER_STATUSES).not.toContain("pending");
    expect(COLLECTED_ORDER_STATUSES).not.toContain("unpaid");
  });

  test("website excludes imported and subscription-generated orders", () => {
    expect(buildOrderSourceMatch("website")).toEqual({
      "metadata.manualImport": { $ne: true },
      orderType: { $ne: "subscription_generated" },
      subscription: null,
    });
  });

  test("subscription source excludes manual imports", () => {
    expect(buildOrderSourceMatch("subscription")).toEqual({
      "metadata.manualImport": { $ne: true },
      $or: [
        { orderType: "subscription_generated" },
        { subscription: { $ne: null } },
      ],
    });
  });

  test("sales query composes source and paid-date OR clauses without overwriting either", () => {
    const match = buildSalesOrderMatch({
      orderSource: "subscription",
      from: "2026-06-01",
      to: "2026-06-30",
      timeZone: "Europe/London",
    });

    expect(match.$and).toHaveLength(4);
    expect(match.$and).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          "metadata.manualImport": { $ne: true },
          $or: expect.any(Array),
        }),
        expect.objectContaining({
          $or: expect.any(Array),
        }),
      ]),
    );
  });
});
