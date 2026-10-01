const {
  DEFAULT_ANALYTICS_TIME_ZONE,
  normalizeTimeZone,
  parseDateRange,
  formatYmdInTimeZone,
} = require("./analyticsDate.util");

const SUPPORTED_REVENUE_INTERVALS = ["day", "week", "month", "year"];

const normalizeRevenueInterval = (interval) => {
  const normalized =
    typeof interval === "string" ? interval.trim().toLowerCase() : "";
  return SUPPORTED_REVENUE_INTERVALS.includes(normalized)
    ? normalized
    : "week";
};

/**
 * Builds the group/sort/project stages for a time-series aggregation.
 *
 * dateExpression may be a Mongo field path (for example "$createdAt") or an
 * expression such as {$ifNull: ["$paidAt", "$createdAt"]}.
 */
const buildRevenueSeriesStages = (
  interval,
  _range,
  {
    dateExpression = "$createdAt",
    timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
  } = {},
) => {
  const tz = normalizeTimeZone(timeZone);
  const normalizedInterval = normalizeRevenueInterval(interval);

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

  if (normalizedInterval === "day") {
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

const parseYmdLabel = (label) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label || "");
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
};

const addCalendarDays = (parts, amount) => {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const compareParts = (a, b) =>
  Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day);

const formatYmdParts = ({ year, month, day }) =>
  [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");

const isoWeekLabel = ({ year, month, day }) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);

  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);

  return `${isoYear}-W${String(week).padStart(2, "0")}`;
};

const buildExpectedSeriesLabels = ({
  interval,
  range,
  from,
  to,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
  now,
} = {}) => {
  const normalizedInterval = normalizeRevenueInterval(interval);
  const parsed = parseDateRange({ range, from, to, timeZone, now });

  // "All time" is intentionally sparse because there is no bounded start/end
  // from which to infer zero-value periods.
  if (parsed.invalid || !parsed.start || !parsed.end) return [];

  const start = parseYmdLabel(formatYmdInTimeZone(parsed.start, timeZone));
  const end = parseYmdLabel(formatYmdInTimeZone(parsed.end, timeZone));
  if (!start || !end) return [];

  if (normalizedInterval === "year") {
    const labels = [];
    for (let year = start.year; year <= end.year; year += 1) {
      labels.push(String(year));
    }
    return labels;
  }

  if (normalizedInterval === "month") {
    const labels = [];
    let year = start.year;
    let month = start.month;

    while (year < end.year || (year === end.year && month <= end.month)) {
      labels.push(`${year}-${String(month).padStart(2, "0")}`);
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }

    return labels;
  }

  if (normalizedInterval === "week") {
    const labels = [];
    const seen = new Set();
    let cursor = start;

    while (compareParts(cursor, end) <= 0) {
      const label = isoWeekLabel(cursor);
      if (!seen.has(label)) {
        labels.push(label);
        seen.add(label);
      }
      cursor = addCalendarDays(cursor, 1);
    }

    return labels;
  }

  const labels = [];
  let cursor = start;
  while (compareParts(cursor, end) <= 0) {
    labels.push(formatYmdParts(cursor));
    cursor = addCalendarDays(cursor, 1);
  }
  return labels;
};

const EMPTY_SERIES_POINT = (label) => ({
  label,
  grossRevenue: 0,
  refunds: 0,
  netRevenue: 0,
  revenue: 0,
  orders: 0,
});

const fillRevenueSeriesPoints = ({
  points,
  interval,
  range,
  from,
  to,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
  now,
} = {}) => {
  const source = Array.isArray(points) ? points : [];
  const labels = buildExpectedSeriesLabels({
    interval,
    range,
    from,
    to,
    timeZone,
    now,
  });

  if (labels.length === 0) {
    return source
      .map((point) => ({ ...EMPTY_SERIES_POINT(point.label), ...point }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }

  const byLabel = new Map(source.map((point) => [point.label, point]));
  return labels.map((label) => ({
    ...EMPTY_SERIES_POINT(label),
    ...(byLabel.get(label) || {}),
    label,
  }));
};

const summarizeRevenueSeries = (points = []) =>
  points.reduce(
    (totals, point) => {
      totals.grossRevenue += Number(point?.grossRevenue) || 0;
      totals.refunds += Number(point?.refunds) || 0;
      totals.netRevenue += Number(point?.netRevenue) || 0;
      totals.revenue += Number(point?.revenue) || 0;
      totals.orders += Number(point?.orders) || 0;
      return totals;
    },
    {
      grossRevenue: 0,
      refunds: 0,
      netRevenue: 0,
      revenue: 0,
      orders: 0,
    },
  );

module.exports = {
  SUPPORTED_REVENUE_INTERVALS,
  normalizeRevenueInterval,
  buildRevenueSeriesStages,
  buildExpectedSeriesLabels,
  fillRevenueSeriesPoints,
  summarizeRevenueSeries,
};
