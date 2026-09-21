"use strict";

const SUBSCRIPTION_TIME_ZONE =
  process.env.DELIVERY_TIME_ZONE ||
  process.env.BUSINESS_TIME_ZONE ||
  "Europe/London";

const HALF_DAY_MS = 12 * 60 * 60 * 1000;

function zonedParts(value, timeZone = SUBSCRIPTION_TIME_ZONE) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function timeZoneOffsetMs(value, timeZone = SUBSCRIPTION_TIME_ZONE) {
  const date = new Date(value);
  const parts = zonedParts(date, timeZone);
  if (!parts) return 0;

  const wallAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return wallAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function sameWallClock(parts, target) {
  return (
    parts &&
    parts.year === target.year &&
    parts.month === target.month &&
    parts.day === target.day &&
    parts.hour === target.hour &&
    parts.minute === target.minute &&
    parts.second === target.second
  );
}

/**
 * Converts a business-local wall clock into an absolute UTC Date.
 *
 * When a clock time is repeated during the autumn DST transition, the earlier
 * instant is chosen. When a clock time falls inside the skipped spring hour,
 * the pre-transition offset is used, matching JavaScript's compatible
 * disambiguation (for example 01:30 becomes 02:30 local).
 */
function zonedDateTimeToUtc(
  {
    year,
    month,
    day,
    hour = 0,
    minute = 0,
    second = 0,
  },
  timeZone = SUBSCRIPTION_TIME_ZONE,
) {
  const target = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };

  const wallAsUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
  );

  const sampleTimes = [
    wallAsUtc - HALF_DAY_MS,
    wallAsUtc,
    wallAsUtc + HALF_DAY_MS,
  ];
  const offsets = [
    ...new Set(
      sampleTimes.map((sample) =>
        timeZoneOffsetMs(new Date(sample), timeZone),
      ),
    ),
  ];

  const exactMatches = offsets
    .map((offset) => new Date(wallAsUtc - offset))
    .filter((candidate) =>
      sameWallClock(zonedParts(candidate, timeZone), target),
    )
    .sort((left, right) => left.getTime() - right.getTime());

  if (exactMatches.length > 0) return exactMatches[0];

  // Non-existent local times (spring-forward gap) use the pre-transition
  // offset, which shifts the wall clock forward by the DST gap.
  const priorOffset = timeZoneOffsetMs(
    new Date(wallAsUtc - HALF_DAY_MS),
    timeZone,
  );
  return new Date(wallAsUtc - priorOffset);
}

function parseCutoffTime(value) {
  const [hours, minutes] = String(value || "22:00")
    .split(":")
    .map((part) => Number(part));

  return {
    hour:
      Number.isInteger(hours) && hours >= 0 && hours <= 23 ? hours : 22,
    minute:
      Number.isInteger(minutes) && minutes >= 0 && minutes <= 59 ? minutes : 0,
  };
}

function shiftCalendarDate({ year, month, day }, days) {
  const shifted = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day) + Number(days || 0)),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function computeSubscriptionCutoffDate(
  deliveryDate,
  settings,
  timeZone = SUBSCRIPTION_TIME_ZONE,
) {
  if (!deliveryDate) return null;
  const deliveryParts = zonedParts(deliveryDate, timeZone);
  if (!deliveryParts) return null;

  const cutoffDate = shiftCalendarDate(
    deliveryParts,
    -(Number(settings?.cutoffDaysBefore) || 0),
  );
  const { hour, minute } = parseCutoffTime(settings?.cutoffTime);

  return zonedDateTimeToUtc(
    {
      ...cutoffDate,
      hour,
      minute,
      second: 0,
    },
    timeZone,
  );
}

function getNextWeekdayDateInTimeZone(
  dayIndex,
  referenceDate = new Date(),
  timeZone = SUBSCRIPTION_TIME_ZONE,
) {
  const targetDay = Number(dayIndex);
  if (!Number.isInteger(targetDay) || targetDay < 0 || targetDay > 6) {
    return null;
  }

  const referenceParts = zonedParts(referenceDate, timeZone);
  if (!referenceParts) return null;

  const localDateAsUtc = new Date(
    Date.UTC(
      referenceParts.year,
      referenceParts.month - 1,
      referenceParts.day,
    ),
  );
  const currentDay = localDateAsUtc.getUTCDay();
  let distance = (targetDay - currentDay + 7) % 7;
  if (distance === 0) distance = 7;

  const targetDate = shiftCalendarDate(referenceParts, distance);
  return zonedDateTimeToUtc(targetDate, timeZone);
}

function addCalendarDaysInTimeZone(
  value,
  days,
  timeZone = SUBSCRIPTION_TIME_ZONE,
) {
  const parts = zonedParts(value, timeZone);
  if (!parts) return null;
  const shifted = shiftCalendarDate(parts, days);
  return zonedDateTimeToUtc(
    {
      ...shifted,
      hour: parts.hour,
      minute: parts.minute,
      second: parts.second,
    },
    timeZone,
  );
}

module.exports = {
  SUBSCRIPTION_TIME_ZONE,
  addCalendarDaysInTimeZone,
  computeSubscriptionCutoffDate,
  getNextWeekdayDateInTimeZone,
  zonedDateTimeToUtc,
  zonedParts,
};
