const {
  resolveComparisonPeriods,
  compareMetric,
} = require("../../utils/analyticsComparison.util");

describe("analyticsComparison.util", () => {
  test("rolling seven-day range compares with the immediately preceding seven days", () => {
    const periods = resolveComparisonPeriods({
      range: "last7",
      timeZone: "Europe/London",
      now: new Date("2026-10-01T12:00:00.000Z"),
    });

    expect(periods.available).toBe(true);
    expect(periods.strategy).toBe("previous_period");
    expect(periods.current).toEqual(
      expect.objectContaining({
        from: "2026-09-25",
        to: "2026-10-01",
        days: 7,
      }),
    );
    expect(periods.previous).toEqual(
      expect.objectContaining({
        from: "2026-09-18",
        to: "2026-09-24",
        days: 7,
      }),
    );
  });

  test("month-to-date compares the same elapsed portion of the previous month", () => {
    const periods = resolveComparisonPeriods({
      range: "thisMonth",
      timeZone: "Europe/London",
      now: new Date("2026-10-15T12:00:00.000Z"),
    });

    expect(periods.strategy).toBe("previous_month_to_date");
    expect(periods.current).toEqual(
      expect.objectContaining({
        from: "2026-10-01",
        to: "2026-10-15",
        days: 15,
      }),
    );
    expect(periods.previous).toEqual(
      expect.objectContaining({
        from: "2026-09-01",
        to: "2026-09-15",
        days: 15,
      }),
    );
  });

  test("month-to-date safely clamps when the previous month is shorter", () => {
    const periods = resolveComparisonPeriods({
      range: "thisMonth",
      timeZone: "Europe/London",
      now: new Date("2026-03-31T12:00:00.000Z"),
    });

    expect(periods.current.to).toBe("2026-03-31");
    expect(periods.previous).toEqual(
      expect.objectContaining({
        from: "2026-02-01",
        to: "2026-02-28",
        days: 28,
      }),
    );
  });

  test("year-to-date compares the equivalent elapsed prior year and clamps leap day", () => {
    const periods = resolveComparisonPeriods({
      range: "thisYear",
      timeZone: "Europe/London",
      now: new Date("2028-02-29T12:00:00.000Z"),
    });

    expect(periods.strategy).toBe("previous_year_to_date");
    expect(periods.current.to).toBe("2028-02-29");
    expect(periods.previous).toEqual(
      expect.objectContaining({
        from: "2027-01-01",
        to: "2027-02-28",
      }),
    );
  });

  test("last month compares against the complete calendar month before it", () => {
    const periods = resolveComparisonPeriods({
      range: "lastMonth",
      timeZone: "Europe/London",
      now: new Date("2026-03-15T12:00:00.000Z"),
    });

    expect(periods.strategy).toBe("previous_calendar_month");
    expect(periods.current).toEqual(
      expect.objectContaining({
        from: "2026-02-01",
        to: "2026-02-28",
      }),
    );
    expect(periods.previous).toEqual(
      expect.objectContaining({
        from: "2026-01-01",
        to: "2026-01-31",
      }),
    );
  });

  test("custom range compares with an adjacent range of the same calendar-day length", () => {
    const periods = resolveComparisonPeriods({
      range: "custom",
      from: "2026-06-10",
      to: "2026-06-12",
      timeZone: "Europe/London",
    });

    expect(periods.current).toEqual(
      expect.objectContaining({
        from: "2026-06-10",
        to: "2026-06-12",
        days: 3,
      }),
    );
    expect(periods.previous).toEqual(
      expect.objectContaining({
        from: "2026-06-07",
        to: "2026-06-09",
        days: 3,
      }),
    );
  });

  test("all-time deliberately has no percentage comparison", () => {
    expect(
      resolveComparisonPeriods({
        range: "all",
        timeZone: "Europe/London",
      }),
    ).toEqual(
      expect.objectContaining({
        available: false,
        reason: "unbounded_range",
      }),
    );
  });

  test("percentage change avoids Infinity when the previous value is zero", () => {
    expect(compareMetric(10, 0)).toEqual({
      current: 10,
      previous: 0,
      absoluteChange: 10,
      percentChange: null,
      percentChangeAvailable: false,
      direction: "up",
    });

    expect(compareMetric(0, 0)).toEqual({
      current: 0,
      previous: 0,
      absoluteChange: 0,
      percentChange: 0,
      percentChangeAvailable: true,
      direction: "flat",
    });
  });

  test("negative previous net revenue still produces a finite directional change", () => {
    expect(compareMetric(20, -10)).toEqual(
      expect.objectContaining({
        absoluteChange: 30,
        percentChange: 300,
        direction: "up",
      }),
    );
  });
});
