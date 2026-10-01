const {
  normalizeRevenueInterval,
  buildRevenueSeriesStages,
  buildExpectedSeriesLabels,
  fillRevenueSeriesPoints,
  summarizeRevenueSeries,
} = require("../../utils/analyticsRevenueSeries.util");

describe("analyticsRevenueSeries.util", () => {
  const paidAt = { $ifNull: ["$paidAt", "$createdAt"] };

  test("supports explicit day/week/month/year intervals", () => {
    expect(normalizeRevenueInterval("DAY")).toBe("day");
    expect(normalizeRevenueInterval("week")).toBe("week");
    expect(normalizeRevenueInterval("month")).toBe("month");
    expect(normalizeRevenueInterval("year")).toBe("year");
    expect(normalizeRevenueInterval("hour")).toBe("week");
  });

  test("day interval always groups by local calendar day", () => {
    const { groupId, sortStage } = buildRevenueSeriesStages("day", "last30", {
      dateExpression: paidAt,
      timeZone: "Europe/London",
    });

    expect(groupId.day.$dateToString).toEqual({
      format: "%Y-%m-%d",
      date: paidAt,
      timezone: "Europe/London",
    });
    expect(sortStage).toEqual({ "_id.day": 1 });
  });

  test("week interval remains weekly even for a short date range", () => {
    const { groupId, projectStage } = buildRevenueSeriesStages("week", "last7", {
      dateExpression: paidAt,
      timeZone: "Europe/London",
    });

    expect(groupId.year.$isoWeekYear).toEqual({
      date: paidAt,
      timezone: "Europe/London",
    });
    expect(groupId.week.$isoWeek).toEqual({
      date: paidAt,
      timezone: "Europe/London",
    });
    expect(projectStage.label.$concat[1]).toBe("-W");
  });

  test("groups monthly using the supplied event date and timezone", () => {
    const { groupId, sortStage } = buildRevenueSeriesStages("month", "all", {
      dateExpression: paidAt,
      timeZone: "Europe/London",
    });

    expect(groupId.year.$year.date).toEqual(paidAt);
    expect(groupId.year.$year.timezone).toBe("Europe/London");
    expect(groupId.month.$month.date).toEqual(paidAt);
    expect(sortStage).toEqual({ "_id.year": 1, "_id.month": 1 });
  });

  test("groups yearly using the supplied event date and timezone", () => {
    const { groupId, sortStage } = buildRevenueSeriesStages("year", "all", {
      dateExpression: paidAt,
      timeZone: "Europe/London",
    });

    expect(groupId).toEqual({
      year: {
        $year: { date: paidAt, timezone: "Europe/London" },
      },
    });
    expect(sortStage).toEqual({ "_id.year": 1 });
  });

  test("builds every daily label in a custom range", () => {
    expect(
      buildExpectedSeriesLabels({
        interval: "day",
        from: "2026-06-10",
        to: "2026-06-12",
        timeZone: "Europe/London",
      }),
    ).toEqual(["2026-06-10", "2026-06-11", "2026-06-12"]);
  });

  test("builds every ISO week intersecting a custom range", () => {
    expect(
      buildExpectedSeriesLabels({
        interval: "week",
        from: "2026-06-01",
        to: "2026-06-14",
        timeZone: "Europe/London",
      }),
    ).toEqual(["2026-W23", "2026-W24"]);
  });

  test("ISO week labels use week-year rather than calendar year", () => {
    expect(
      buildExpectedSeriesLabels({
        interval: "week",
        from: "2025-12-29",
        to: "2026-01-04",
        timeZone: "Europe/London",
      }),
    ).toEqual(["2026-W01"]);
  });

  test("builds complete month and year buckets across boundaries", () => {
    expect(
      buildExpectedSeriesLabels({
        interval: "month",
        from: "2025-11-15",
        to: "2026-02-10",
      }),
    ).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);

    expect(
      buildExpectedSeriesLabels({
        interval: "year",
        from: "2024-11-15",
        to: "2026-02-10",
      }),
    ).toEqual(["2024", "2025", "2026"]);
  });

  test("zero-fills missing periods without changing real values", () => {
    const points = fillRevenueSeriesPoints({
      interval: "day",
      from: "2026-06-10",
      to: "2026-06-12",
      points: [
        {
          label: "2026-06-10",
          grossRevenue: 20,
          refunds: 0,
          netRevenue: 20,
          revenue: 20,
          orders: 1,
        },
        {
          label: "2026-06-12",
          grossRevenue: 0,
          refunds: 5,
          netRevenue: -5,
          revenue: -5,
          orders: 0,
        },
      ],
    });

    expect(points).toEqual([
      {
        label: "2026-06-10",
        grossRevenue: 20,
        refunds: 0,
        netRevenue: 20,
        revenue: 20,
        orders: 1,
      },
      {
        label: "2026-06-11",
        grossRevenue: 0,
        refunds: 0,
        netRevenue: 0,
        revenue: 0,
        orders: 0,
      },
      {
        label: "2026-06-12",
        grossRevenue: 0,
        refunds: 5,
        netRevenue: -5,
        revenue: -5,
        orders: 0,
      },
    ]);
  });

  test("all-time remains sparse because it has no bounded start/end", () => {
    const points = fillRevenueSeriesPoints({
      interval: "month",
      range: "all",
      points: [
        { label: "2025-01", revenue: 10, orders: 1 },
        { label: "2026-03", revenue: 20, orders: 2 },
      ],
    });

    expect(points).toHaveLength(2);
    expect(points[0]).toEqual(
      expect.objectContaining({
        label: "2025-01",
        revenue: 10,
        orders: 1,
        grossRevenue: 0,
        refunds: 0,
        netRevenue: 0,
      }),
    );
  });

  test("series totals include sales, refunds, net revenue and orders", () => {
    expect(
      summarizeRevenueSeries([
        {
          label: "a",
          grossRevenue: 100,
          refunds: 10,
          netRevenue: 90,
          revenue: 90,
          orders: 2,
        },
        {
          label: "b",
          grossRevenue: 40,
          refunds: 5,
          netRevenue: 35,
          revenue: 35,
          orders: 1,
        },
      ]),
    ).toEqual({
      grossRevenue: 140,
      refunds: 15,
      netRevenue: 125,
      revenue: 125,
      orders: 3,
    });
  });

  test.each([null, undefined, 42, {}, []])(
    "invalid interval=%p defaults to week",
    (interval) => {
      const { groupId } = buildRevenueSeriesStages(interval, "last30");
      expect(groupId.year).toBeDefined();
      expect(groupId.week).toBeDefined();
    },
  );
});
