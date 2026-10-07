const DEFAULT_ANALYTICS_TIME_ZONE =
  process.env.ANALYTICS_TIME_ZONE || "Europe/London";

const normalizeTimeZone = (timeZone) => {
  const candidate =
    typeof timeZone === "string" && timeZone.trim()
      ? timeZone.trim()
      : DEFAULT_ANALYTICS_TIME_ZONE;

  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_ANALYTICS_TIME_ZONE;
  }
};

const parseYmd = (value) => {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
};

const getZonedDateParts = (date, timeZone = DEFAULT_ANALYTICS_TIME_ZONE) => {
  const tz = normalizeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
};

const zonedDateTimeToUtc = (
  { year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0 },
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
) => {
  const tz = normalizeTimeZone(timeZone);
  const desiredUtcLike = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );

  let candidate = desiredUtcLike;

  // Iterating handles the UTC offset on either side of DST boundaries without
  // depending on the host machine's local timezone.
  for (let i = 0; i < 4; i += 1) {
    const actual = getZonedDateParts(new Date(candidate), tz);
    const actualUtcLike = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      millisecond,
    );
    const delta = desiredUtcLike - actualUtcLike;
    if (delta === 0) break;
    candidate += delta;
  }

  return new Date(candidate);
};

const addCalendarDays = ({ year, month, day }, amount) => {
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const addCalendarMonths = ({ year, month, day = 1 }, amount) => {
  const date = new Date(Date.UTC(year, month - 1 + amount, day));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const startOfLocalDayUtc = (parts, timeZone = DEFAULT_ANALYTICS_TIME_ZONE) =>
  zonedDateTimeToUtc({ ...parts, hour: 0, minute: 0, second: 0, millisecond: 0 }, timeZone);

const endOfLocalDayUtc = (parts, timeZone = DEFAULT_ANALYTICS_TIME_ZONE) => {
  const next = startOfLocalDayUtc(addCalendarDays(parts, 1), timeZone);
  return new Date(next.getTime() - 1);
};

// Kept for callers that operate on a Date. These now clamp in the analytics
// timezone rather than the Node process timezone.
const clampToStartOfDay = (date, timeZone = DEFAULT_ANALYTICS_TIME_ZONE) => {
  const parts = getZonedDateParts(new Date(date), timeZone);
  return startOfLocalDayUtc(parts, timeZone);
};

const clampToEndOfDay = (date, timeZone = DEFAULT_ANALYTICS_TIME_ZONE) => {
  const parts = getZonedDateParts(new Date(date), timeZone);
  return endOfLocalDayUtc(parts, timeZone);
};

const parseDateRange = ({
  range,
  from,
  to,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
  now = new Date(),
} = {}) => {
  const tz = normalizeTimeZone(timeZone);
  const today = getZonedDateParts(new Date(now), tz);
  const todayYmd = { year: today.year, month: today.month, day: today.day };

  const hasCustom = Boolean(from || to);
  if (hasCustom) {
    const fromParts = from ? parseYmd(from) : null;
    const toParts = to ? parseYmd(to) : null;

    if ((from && !fromParts) || (to && !toParts)) {
      return { start: null, end: null, timeZone: tz, invalid: true };
    }

    const start = fromParts ? startOfLocalDayUtc(fromParts, tz) : null;
    const end = toParts ? endOfLocalDayUtc(toParts, tz) : null;

    if (start && end && start > end) {
      return { start: null, end: null, timeZone: tz, invalid: true };
    }

    return { start, end, timeZone: tz, invalid: false };
  }

  const r = typeof range === "string" ? range : "all";
  if (r === "all") {
    return { start: null, end: null, timeZone: tz, invalid: false };
  }

  let startParts = todayYmd;
  let endParts = todayYmd;

  if (r === "yesterday") {
    startParts = addCalendarDays(todayYmd, -1);
    endParts = startParts;
  } else if (r === "last7") {
    startParts = addCalendarDays(todayYmd, -6);
  } else if (r === "last30") {
    startParts = addCalendarDays(todayYmd, -29);
  } else if (r === "thisMonth") {
    startParts = { year: today.year, month: today.month, day: 1 };
  } else if (r === "lastMonth") {
    startParts = addCalendarMonths(
      { year: today.year, month: today.month, day: 1 },
      -1,
    );
    endParts = addCalendarDays(
      { year: today.year, month: today.month, day: 1 },
      -1,
    );
  } else if (r === "thisYear") {
    startParts = { year: today.year, month: 1, day: 1 };
  } else if (r === "lastYear") {
    startParts = { year: today.year - 1, month: 1, day: 1 };
    endParts = { year: today.year - 1, month: 12, day: 31 };
  } else if (r !== "today") {
    return { start: null, end: null, timeZone: tz, invalid: false };
  }

  return {
    start: startOfLocalDayUtc(startParts, tz),
    end: endOfLocalDayUtc(endParts, tz),
    timeZone: tz,
    invalid: false,
  };
};

const buildFieldRange = ({ start, end }) => {
  if (!start && !end) return null;
  const value = {};
  if (start) value.$gte = start;
  if (end) value.$lte = end;
  return value;
};

const buildEventDateMatch = ({
  range,
  from,
  to,
  field,
  fallbackField,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
  now,
} = {}) => {
  if (!field) return {};

  const parsed = parseDateRange({ range, from, to, timeZone, now });
  if (parsed.invalid) {
    // Impossible predicate: invalid user input must never silently become "all".
    return { _id: { $exists: false } };
  }

  const fieldRange = buildFieldRange(parsed);
  if (!fieldRange) return {};

  if (!fallbackField) {
    return { [field]: fieldRange };
  }

  return {
    $or: [
      { [field]: fieldRange },
      {
        [field]: null,
        [fallbackField]: fieldRange,
      },
    ],
  };
};

const buildCreatedAtMatch = (options = {}) =>
  buildEventDateMatch({ ...options, field: "createdAt" });

const formatYmdInTimeZone = (
  date,
  timeZone = DEFAULT_ANALYTICS_TIME_ZONE,
) => {
  const tz = normalizeTimeZone(timeZone);
  const parts = getZonedDateParts(new Date(date), tz);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
};

module.exports = {
  DEFAULT_ANALYTICS_TIME_ZONE,
  normalizeTimeZone,
  parseYmd,
  getZonedDateParts,
  zonedDateTimeToUtc,
  startOfLocalDayUtc,
  endOfLocalDayUtc,
  clampToStartOfDay,
  clampToEndOfDay,
  parseDateRange,
  buildEventDateMatch,
  buildCreatedAtMatch,
  formatYmdInTimeZone,
};
