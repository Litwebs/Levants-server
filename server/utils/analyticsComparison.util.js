"use strict";

const {
  DEFAULT_ANALYTICS_TIME_ZONE,
  normalizeTimeZone,
  parseYmd,
  parseDateRange,
  formatYmdInTimeZone,
} = require("./analyticsDate.util");

const ANALYTICS_COMPARISON_MODES = [
  "previous_period",
  "previous_year",
  "none",
];

const ymdFromParts = ({ year, month, day }) =>
  [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");

const partsFromDateUtc = (date) => ({
  year: date.getUTCFullYear(),
  month: date.getUTCMonth() + 1,
  day: date.getUTCDate(),
});

const addCalendarDays = (parts, amount) => {
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + amount),
  );
  return partsFromDateUtc(date);
};

const addCalendarMonths = (parts, amount) => {
  const date = new Date(Date.UTC(parts.year, parts.month - 1 + amount, 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: 1,
  };
};

const daysInMonth = (year, month) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const clampDay = ({ year, month, day }) => ({
  year,
  month,
  day: Math.min(day, daysInMonth(year, month)),
});

const shiftYearsClamped = (parts, years) =>
  clampDay({
    year: parts.year + years,
    month: parts.month,
    day: parts.day,
  });

const calendarDayCountInclusive = (fromParts, toParts) => {
  const fromMs = Date.UTC(
    fromParts.year,
    fromParts.month - 1,
    fromParts.day,
  );
  const toMs = Date.UTC(toParts.year, toParts.month - 1, toParts.day);
  return Math.floor((toMs - fromMs) / 86400000) + 1;
};

const toPeriod = (fromParts, toParts, timeZone) => {
  const from = ymdFromParts(fromParts);
  const to = ymdFromParts(toParts);
  const parsed = parseDateRange({ from, to, timeZone });

  return {
    from,
    to,
    start: parsed.start,
    end: parsed.end,
    days: calendarDayCountInclusive(fromParts, toParts),
  };
};

const resolveComparisonPeriods = ({
  range,
  from,
  to,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
  now = new Date(),
  comparisonMode = "previous_period",
} = {}) => {
  const tz = normalizeTimeZone(timeZone);

  if (!ANALYTICS_COMPARISON_MODES.includes(comparisonMode)) {
    return {
      available: false,
      reason: "invalid_comparison",
      strategy: null,
      timeZone: tz,
      current: null,
      previous: null,
    };
  }

  const normalizedRange =
    typeof range === "string" && range.trim() ? range.trim() : "all";

  if (normalizedRange === "all" && !from && !to) {
    return {
      available: false,
      reason: "unbounded_range",
      strategy: null,
      timeZone: tz,
      current: null,
      previous: null,
    };
  }

  const currentParsed = parseDateRange({
    range: normalizedRange,
    from,
    to,
    timeZone: tz,
    now,
  });

  if (currentParsed.invalid || !currentParsed.start || !currentParsed.end) {
    return {
      available: false,
      reason: currentParsed.invalid ? "invalid_range" : "unbounded_range",
      strategy: null,
      timeZone: tz,
      current: null,
      previous: null,
    };
  }

  const currentFrom = parseYmd(formatYmdInTimeZone(currentParsed.start, tz));
  const currentTo = parseYmd(formatYmdInTimeZone(currentParsed.end, tz));

  if (!currentFrom || !currentTo) {
    return {
      available: false,
      reason: "invalid_range",
      strategy: null,
      timeZone: tz,
      current: null,
      previous: null,
    };
  }

  if (comparisonMode === "none") {
    return {
      available: false,
      reason: "comparison_disabled",
      strategy: "none",
      timeZone: tz,
      current: toPeriod(currentFrom, currentTo, tz),
      previous: null,
    };
  }

  let previousFrom;
  let previousTo;
  let strategy = "previous_period";

  if (comparisonMode === "previous_year") {
    strategy = "previous_year";
    previousFrom = shiftYearsClamped(currentFrom, -1);
    previousTo = shiftYearsClamped(currentTo, -1);
  } else if (normalizedRange === "thisMonth" && !from && !to) {
    strategy = "previous_month_to_date";
    const previousMonthStart = addCalendarMonths(
      { year: currentFrom.year, month: currentFrom.month, day: 1 },
      -1,
    );
    previousFrom = previousMonthStart;
    previousTo = clampDay({
      year: previousMonthStart.year,
      month: previousMonthStart.month,
      day: currentTo.day,
    });
  } else if (normalizedRange === "lastMonth" && !from && !to) {
    strategy = "previous_calendar_month";
    const previousMonthStart = addCalendarMonths(currentFrom, -1);
    previousFrom = previousMonthStart;
    previousTo = {
      year: previousMonthStart.year,
      month: previousMonthStart.month,
      day: daysInMonth(previousMonthStart.year, previousMonthStart.month),
    };
  } else if (normalizedRange === "thisYear" && !from && !to) {
    strategy = "previous_year_to_date";
    previousFrom = { year: currentFrom.year - 1, month: 1, day: 1 };
    previousTo = shiftYearsClamped(currentTo, -1);
  } else if (normalizedRange === "lastYear" && !from && !to) {
    strategy = "previous_calendar_year";
    previousFrom = { year: currentFrom.year - 1, month: 1, day: 1 };
    previousTo = { year: currentFrom.year - 1, month: 12, day: 31 };
  } else {
    const days = calendarDayCountInclusive(currentFrom, currentTo);
    previousTo = addCalendarDays(currentFrom, -1);
    previousFrom = addCalendarDays(previousTo, -(days - 1));
  }

  return {
    available: true,
    reason: null,
    strategy,
    timeZone: tz,
    current: toPeriod(currentFrom, currentTo, tz),
    previous: toPeriod(previousFrom, previousTo, tz),
  };
};

const roundPercent = (value) => {
  if (!Number.isFinite(value)) return null;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

const compareMetric = (currentValue, previousValue) => {
  const current = Number(currentValue) || 0;
  const previous = Number(previousValue) || 0;
  const absoluteChange = current - previous;
  const direction =
    absoluteChange > 0 ? "up" : absoluteChange < 0 ? "down" : "flat";

  let percentChange;
  let percentChangeAvailable = true;

  if (previous === 0) {
    if (current === 0) {
      percentChange = 0;
    } else {
      percentChange = null;
      percentChangeAvailable = false;
    }
  } else {
    // Absolute denominator keeps the mathematical direction intuitive even
    // when a net-revenue period is negative because refunds exceeded sales.
    percentChange = roundPercent((absoluteChange / Math.abs(previous)) * 100);
  }

  return {
    current,
    previous,
    absoluteChange,
    percentChange,
    percentChangeAvailable,
    direction,
  };
};

const compareMetrics = (current, previous, metricNames) =>
  Object.fromEntries(
    metricNames.map((metric) => [
      metric,
      compareMetric(current?.[metric], previous?.[metric]),
    ]),
  );

module.exports = {
  ANALYTICS_COMPARISON_MODES,
  resolveComparisonPeriods,
  compareMetric,
  compareMetrics,
};
