const clampToStartOfDay = (d) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

const clampToEndOfDay = (d) => {
  const date = new Date(d);
  date.setHours(23, 59, 59, 999);
  return date;
};

const parseDateRange = ({ range, from, to } = {}) => {
  const now = new Date();

  const hasCustom = Boolean(from || to);
  if (hasCustom) {
    const start = from ? clampToStartOfDay(new Date(from)) : null;
    const end = to ? clampToEndOfDay(new Date(to)) : null;

    if (
      (start && Number.isNaN(start.getTime())) ||
      (end && Number.isNaN(end.getTime()))
    ) {
      return { start: null, end: null };
    }

    return { start, end };
  }

  const r = typeof range === "string" ? range : "all";

  if (r === "all") return { start: null, end: null };

  if (r === "today") {
    return { start: clampToStartOfDay(now), end: clampToEndOfDay(now) };
  }

  if (r === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { start: clampToStartOfDay(y), end: clampToEndOfDay(y) };
  }

  if (r === "last7") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { start: clampToStartOfDay(start), end: clampToEndOfDay(now) };
  }

  if (r === "last30") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { start: clampToStartOfDay(start), end: clampToEndOfDay(now) };
  }

  if (r === "thisMonth") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: clampToStartOfDay(start), end: clampToEndOfDay(now) };
  }

  if (r === "lastMonth") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: clampToStartOfDay(start), end: clampToEndOfDay(end) };
  }

  if (r === "thisYear") {
    const start = new Date(now.getFullYear(), 0, 1);
    return { start: clampToStartOfDay(start), end: clampToEndOfDay(now) };
  }

  if (r === "lastYear") {
    const start = new Date(now.getFullYear() - 1, 0, 1);
    const end = new Date(now.getFullYear() - 1, 11, 31);
    return { start: clampToStartOfDay(start), end: clampToEndOfDay(end) };
  }

  return { start: null, end: null };
};

const buildCreatedAtMatch = ({ range, from, to } = {}) => {
  const { start, end } = parseDateRange({ range, from, to });

  if (!start && !end) return {};

  const createdAt = {};
  if (start) createdAt.$gte = start;
  if (end) createdAt.$lte = end;

  return { createdAt };
};

// en-CA yields YYYY-MM-DD in most JS engines.
const formatYmdInTimeZone = (date, timeZone) => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

module.exports = {
  clampToStartOfDay,
  clampToEndOfDay,
  parseDateRange,
  buildCreatedAtMatch,
  formatYmdInTimeZone,
};
