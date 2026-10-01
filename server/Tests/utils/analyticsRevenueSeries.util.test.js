const {
  buildRevenueSeriesStages,
} = require("../../utils/analyticsRevenueSeries.util");

describe("buildRevenueSeriesStages", () => {
  const paidAt = { $ifNull: ["$paidAt", "$createdAt"] };

  test("groups yearly using the supplied event date and timezone", () => {
    const { groupId, sortStage, projectStage } = buildRevenueSeriesStages(
      "year",
      "all",
      { dateExpression: paidAt, timeZone: "Europe/London" },
    );

    expect(groupId).toEqual({
      year: {
        $year: { date: paidAt, timezone: "Europe/London" },
      },
    });
    expect(sortStage).toEqual({ "_id.year": 1 });
    expect(projectStage.label).toEqual({ $toString: "$_id.year" });
  });

  test("groups monthly using the supplied event date and timezone", () => {
    const { groupId, sortStage, projectStage } = buildRevenueSeriesStages(
      "month",
      "all",
      { dateExpression: paidAt, timeZone: "Europe/London" },
    );

    expect(groupId.year.$year.date).toEqual(paidAt);
    expect(groupId.year.$year.timezone).toBe("Europe/London");
    expect(groupId.month.$month.date).toEqual(paidAt);
    expect(sortStage).toEqual({ "_id.year": 1, "_id.month": 1 });
    expect(projectStage.label.$concat).toBeDefined();
  });

  test.each(["today", "yesterday", "last7"])(
    "week interval uses daily buckets for short range=%s",
    (range) => {
      const { groupId, sortStage } = buildRevenueSeriesStages("week", range, {
        dateExpression: paidAt,
        timeZone: "Europe/London",
      });

      expect(groupId.day.$dateToString).toEqual({
        format: "%Y-%m-%d",
        date: paidAt,
        timezone: "Europe/London",
      });
      expect(sortStage).toEqual({ "_id.day": 1 });
    },
  );

  test("explicit day interval stays daily for custom ranges", () => {
    const { groupId } = buildRevenueSeriesStages("day", "custom", {
      dateExpression: paidAt,
      timeZone: "Europe/London",
    });

    expect(groupId.day.$dateToString.format).toBe("%Y-%m-%d");
  });

  test("weekly labels include ISO week-year to avoid multi-year collisions", () => {
    const { groupId, projectStage } = buildRevenueSeriesStages(
      "week",
      "last30",
      { dateExpression: paidAt, timeZone: "Europe/London" },
    );

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

  test.each([null, undefined, 42, {}, []])(
    "invalid interval=%p defaults to week",
    (interval) => {
      const { groupId } = buildRevenueSeriesStages(interval, "last30");
      expect(groupId.year).toBeDefined();
      expect(groupId.week).toBeDefined();
    },
  );
});
