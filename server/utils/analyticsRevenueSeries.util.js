const {
  DEFAULT_ANALYTICS_TIME_ZONE,
  normalizeTimeZone,
} = require("./analyticsDate.util");

/**
 * Builds the group/sort/project stages for a time-series aggregation.
 *
 * dateExpression may be a Mongo field path (for example "$createdAt") or an
 * expression such as {$ifNull: ["$paidAt", "$createdAt"]}.
 */
const buildRevenueSeriesStages = (
  interval,
  range,
  {
    dateExpression = "$createdAt",
    timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
  } = {},
) => {
  const tz = normalizeTimeZone(timeZone);
  const normalizedInterval =
    typeof interval === "string" ? interval.toLowerCase() : "week";

  const dateToString = (format) => ({
    $dateToString: {
      format,
      date: dateExpression,
      timezone: tz,
    },
  });

  const yearExpression = {
    $year: { date: dateExpression, timezone: tz },
  };

  if (normalizedInterval === "year") {
    return {
      groupId: { year: yearExpression },
      sortStage: { "_id.year": 1 },
      projectStage: {
        _id: 0,
        label: { $toString: "$_id.year" },
        revenue: 1,
        orders: 1,
      },
    };
  }

  if (normalizedInterval === "month") {
    return {
      groupId: {
        year: yearExpression,
        month: { $month: { date: dateExpression, timezone: tz } },
      },
      sortStage: { "_id.year": 1, "_id.month": 1 },
      projectStage: {
        _id: 0,
        label: {
          $concat: [
            { $toString: "$_id.year" },
            "-",
            {
              $cond: [
                { $lt: ["$_id.month", 10] },
                { $concat: ["0", { $toString: "$_id.month" }] },
                { $toString: "$_id.month" },
              ],
            },
          ],
        },
        revenue: 1,
        orders: 1,
      },
    };
  }

  const normalizedRange = typeof range === "string" ? range : "all";
  const useDaily =
    normalizedInterval === "day" ||
    (normalizedInterval === "week" &&
      ["today", "yesterday", "last7"].includes(normalizedRange));

  if (useDaily) {
    return {
      groupId: { day: dateToString("%Y-%m-%d") },
      sortStage: { "_id.day": 1 },
      projectStage: {
        _id: 0,
        label: "$_id.day",
        revenue: 1,
        orders: 1,
      },
    };
  }

  // ISO week labels include the ISO week-year so multi-year ranges do not
  // collapse identical week numbers from different years.
  return {
    groupId: {
      year: { $isoWeekYear: { date: dateExpression, timezone: tz } },
      week: { $isoWeek: { date: dateExpression, timezone: tz } },
    },
    sortStage: { "_id.year": 1, "_id.week": 1 },
    projectStage: {
      _id: 0,
      label: {
        $concat: [
          { $toString: "$_id.year" },
          "-W",
          {
            $cond: [
              { $lt: ["$_id.week", 10] },
              { $concat: ["0", { $toString: "$_id.week" }] },
              { $toString: "$_id.week" },
            ],
          },
        ],
      },
      revenue: 1,
      orders: 1,
    },
  };
};

module.exports = { buildRevenueSeriesStages };
