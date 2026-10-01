"use strict";

const { parseYmd } = require("../utils/analyticsDate.util");
const {
  SUPPORTED_REVENUE_INTERVALS,
  MAX_REVENUE_SERIES_BUCKETS,
  estimateRevenueSeriesBucketCount,
} = require("../utils/analyticsRevenueSeries.util");
const { sendErr } = require("../utils/response.util");

const ANALYTICS_RANGES = [
  "all",
  "today",
  "yesterday",
  "last7",
  "last30",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "lastYear",
  "custom",
];

const ANALYTICS_ORDER_SOURCES = [
  "all",
  "website",
  "subscription",
  "imported",
];

const fail = (res, message) =>
  sendErr(res, {
    statusCode: 400,
    code: "INVALID_ANALYTICS_QUERY",
    message,
  });

const parseStrictPositiveInteger = (value) => {
  if (value === undefined) return null;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return NaN;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : NaN;
};

const validateDateSelection = (query) => {
  const { range, from, to } = query;
  const hasFrom = typeof from === "string" && from.length > 0;
  const hasTo = typeof to === "string" && to.length > 0;
  const hasCustomDates = hasFrom || hasTo;

  if (range !== undefined && !ANALYTICS_RANGES.includes(range)) {
    return "Invalid analytics range.";
  }

  if (hasFrom !== hasTo) {
    return "Custom analytics ranges require both from and to dates.";
  }

  if (range === "custom" && !(hasFrom && hasTo)) {
    return "Custom analytics ranges require both from and to dates.";
  }

  if (hasCustomDates && range && range !== "custom") {
    return "Use either a named analytics range or custom from/to dates, not both.";
  }

  if (hasFrom && (!parseYmd(from) || !parseYmd(to))) {
    return "Analytics dates must use YYYY-MM-DD and be valid calendar dates.";
  }

  if (hasFrom) {
    const fromMs = Date.parse(`${from}T00:00:00.000Z`);
    const toMs = Date.parse(`${to}T00:00:00.000Z`);
    if (fromMs > toMs) {
      return "Analytics from date must be on or before the to date.";
    }
  }

  return null;
};

const validateAnalyticsQuery =
  ({
    allowInterval = false,
    maxLimit = null,
    allowDays = false,
    enforceSeriesBucketLimit = false,
  } = {}) =>
  (req, res, next) => {
    const dateError = validateDateSelection(req.query);
    if (dateError) return fail(res, dateError);

    const { orderSource, interval, limit, days } = req.query;

    if (
      orderSource !== undefined &&
      !ANALYTICS_ORDER_SOURCES.includes(orderSource)
    ) {
      return fail(res, "Invalid analytics order source.");
    }

    if (interval !== undefined) {
      if (!allowInterval) {
        return fail(res, "This analytics endpoint does not accept interval.");
      }

      if (!SUPPORTED_REVENUE_INTERVALS.includes(interval)) {
        return fail(
          res,
          "Analytics interval must be day, week, month, or year.",
        );
      }
    }

    if (limit !== undefined) {
      if (maxLimit === null) {
        return fail(res, "This analytics endpoint does not accept limit.");
      }

      const parsedLimit = parseStrictPositiveInteger(limit);
      if (!Number.isFinite(parsedLimit) || parsedLimit > maxLimit) {
        return fail(
          res,
          `Analytics limit must be an integer between 1 and ${maxLimit}.`,
        );
      }
    }

    if (days !== undefined) {
      if (!allowDays) {
        return fail(res, "This analytics endpoint does not accept days.");
      }

      const parsedDays = parseStrictPositiveInteger(days);
      if (
        !Number.isFinite(parsedDays) ||
        parsedDays < 7 ||
        parsedDays > 90
      ) {
        return fail(res, "Analytics days must be an integer between 7 and 90.");
      }
    }

    if (enforceSeriesBucketLimit) {
      const bucketCount = estimateRevenueSeriesBucketCount({
        interval: interval || "week",
        range: req.query.range,
        from: req.query.from,
        to: req.query.to,
      });

      if (bucketCount > MAX_REVENUE_SERIES_BUCKETS) {
        return fail(
          res,
          `Requested time series contains ${bucketCount} buckets; maximum is ${MAX_REVENUE_SERIES_BUCKETS}. Use a coarser interval or a shorter date range.`,
        );
      }
    }

    return next();
  };

module.exports = {
  ANALYTICS_RANGES,
  ANALYTICS_ORDER_SOURCES,
  validateAnalyticsQuery,
};
