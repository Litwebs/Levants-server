const {
  buildRevenueSeriesStages,
} = require("../../utils/analyticsRevenueSeries.util");

describe("buildRevenueSeriesStages", () => {
  // -------------------------------------------------------------------------
  // interval: "year"
  // -------------------------------------------------------------------------
  describe('interval = "year"', () => {
    test("groups by year only", () => {
      const { groupId, sortStage, projectStage } = buildRevenueSeriesStages(
        "year",
        "last12Months",
      );

      expect(groupId).toEqual({ year: { $year: "$createdAt" } });
    });

    test("sorts by year ascending", () => {
      const { sortStage } = buildRevenueSeriesStages("year", "all");
      expect(sortStage).toEqual({ "_id.year": 1 });
    });

    test("projects label as string year", () => {
      const { projectStage } = buildRevenueSeriesStages("year", "all");
      expect(projectStage.label).toEqual({ $toString: "$_id.year" });
      expect(projectStage._id).toBe(0);
      expect(projectStage.revenue).toBe(1);
      expect(projectStage.orders).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // interval: "month"
  // -------------------------------------------------------------------------
  describe('interval = "month"', () => {
    test("groups by year and month", () => {
      const { groupId } = buildRevenueSeriesStages("month", "last12Months");
      expect(groupId).toMatchObject({
        year: { $year: "$createdAt" },
        month: { $month: "$createdAt" },
      });
    });

    test("sorts by year then month ascending", () => {
      const { sortStage } = buildRevenueSeriesStages("month", "all");
      expect(sortStage).toEqual({ "_id.year": 1, "_id.month": 1 });
    });

    test("project label is zero-padded YYYY-MM", () => {
      const { projectStage } = buildRevenueSeriesStages("month", "all");
      // label is a $concat expression
      expect(projectStage.label.$concat).toBeDefined();
      expect(projectStage.label.$concat[1]).toBe("-");
    });
  });

  // -------------------------------------------------------------------------
  // interval: "week" with short ranges (daily grouping)
  // -------------------------------------------------------------------------
  describe('interval = "week" on short ranges (daily)', () => {
    test.each(["today", "yesterday", "last7"])(
      "uses daily grouping for range=%s",
      (range) => {
        const { groupId, sortStage, projectStage } = buildRevenueSeriesStages(
          "week",
          range,
        );

        expect(groupId.day).toBeDefined();
        expect(groupId.day.$dateToString.format).toBe("%Y-%m-%d");
        expect(sortStage).toEqual({ "_id.day": 1 });
        expect(projectStage.label).toBe("$_id.day");
      },
    );
  });

  // -------------------------------------------------------------------------
  // interval: "week" with longer ranges (ISO week grouping)
  // -------------------------------------------------------------------------
  describe('interval = "week" on longer ranges (ISO week)', () => {
    test.each(["last30", "last90", "all", "last12Months", "thisMonth"])(
      "uses ISO week grouping for range=%s",
      (range) => {
        const { groupId, sortStage, projectStage } = buildRevenueSeriesStages(
          "week",
          range,
        );

        expect(groupId.year).toBeDefined();
        expect(groupId.week).toBeDefined();
        expect(groupId.year.$isoWeekYear).toBe("$createdAt");
        expect(sortStage).toEqual({ "_id.year": 1, "_id.week": 1 });
      },
    );
  });

  // -------------------------------------------------------------------------
  // Default: non-string interval falls back to "week"
  // -------------------------------------------------------------------------
  describe("invalid / missing interval defaults to week", () => {
    test.each([null, undefined, 42, {}, []])(
      "defaults to ISO week grouping for interval=%p",
      (interval) => {
        const { groupId } = buildRevenueSeriesStages(interval, "last30");
        // Should be week (ISO) grouping
        expect(groupId.year).toBeDefined();
        expect(groupId.week).toBeDefined();
      },
    );

    test("defaults to daily grouping when interval invalid and range is short", () => {
      const { groupId } = buildRevenueSeriesStages(undefined, "today");
      expect(groupId.day).toBeDefined();
    });
  });
});
