const {
  resolveComparisonPeriods,
} = require("../../utils/analyticsComparison.util");

describe("analytics comparison selector utility", () => {
  test("previous_year uses the same calendar dates one year earlier and clamps leap day", () => {
    const result = resolveComparisonPeriods({
      from: "2024-02-29",
      to: "2024-03-01",
      comparisonMode: "previous_year",
      timeZone: "Europe/London",
    });

    expect(result.available).toBe(true);
    expect(result.strategy).toBe("previous_year");
    expect(result.current).toEqual(
      expect.objectContaining({
        from: "2024-02-29",
        to: "2024-03-01",
      }),
    );
    expect(result.previous).toEqual(
      expect.objectContaining({
        from: "2023-02-28",
        to: "2023-03-01",
      }),
    );
  });

  test("none disables comparison without losing the selected current period", () => {
    const result = resolveComparisonPeriods({
      from: "2026-06-10",
      to: "2026-06-12",
      comparisonMode: "none",
      timeZone: "Europe/London",
    });

    expect(result).toEqual(
      expect.objectContaining({
        available: false,
        reason: "comparison_disabled",
        strategy: "none",
        previous: null,
      }),
    );
    expect(result.current).toEqual(
      expect.objectContaining({
        from: "2026-06-10",
        to: "2026-06-12",
      }),
    );
  });
});
