/**
 * Builds the $group, $sort, and $project pipeline stages for the
 * revenue time-series aggregation based on the requested interval and range.
 *
 * @param {string} interval  "year" | "month" | "week" (default)
 * @param {string} range     Named range string (e.g. "today", "last7") — used
 *                           to decide whether the "week" bucket should fall back
 *                           to daily grouping on short ranges.
 * @returns {{ groupId: object, sortStage: object, projectStage: object }}
 */
const buildRevenueSeriesStages = (interval, range) => {
  const i = typeof interval === "string" ? interval : "week";

  if (i === "year") {
    return {
      groupId: { year: { $year: "$createdAt" } },
      sortStage: { "_id.year": 1 },
      projectStage: {
        _id: 0,
        label: { $toString: "$_id.year" },
        revenue: 1,
        orders: 1,
      },
    };
  }

  if (i === "month") {
    return {
      groupId: {
        year: { $year: "$createdAt" },
        month: { $month: "$createdAt" },
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

  // "week" interval on short ranges should still show multiple points.
  // For today/yesterday/last7 we group by day.
  const r = typeof range === "string" ? range : "all";
  const useDaily = r === "today" || r === "yesterday" || r === "last7";

  if (useDaily) {
    return {
      groupId: {
        day: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
        },
      },
      sortStage: { "_id.day": 1 },
      projectStage: {
        _id: 0,
        label: "$_id.day",
        revenue: 1,
        orders: 1,
      },
    };
  }

  // week (ISO)
  return {
    groupId: {
      year: { $isoWeekYear: "$createdAt" },
      week: { $isoWeek: "$createdAt" },
    },
    sortStage: { "_id.year": 1, "_id.week": 1 },
    projectStage: {
      _id: 0,
      label: {
        $concat: [
          "Wk-",
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
