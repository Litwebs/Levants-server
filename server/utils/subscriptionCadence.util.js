"use strict";

const {
  SUBSCRIPTION_TIME_ZONE,
  weekdayInTimeZone,
  zonedDateTimeToUtc,
  zonedParts,
} = require("./subscriptionCutoff.util");

function normalizeWeekday(value, fallback) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) {
    return numeric;
  }
  return Number(fallback);
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdayForCalendarDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function isLastWeekSlot(parts) {
  return parts.day + 7 > daysInMonth(parts.year, parts.month);
}

function weekdayOccurrence(parts) {
  return Math.floor((parts.day - 1) / 7) + 1;
}

function lastWeekdayDayOfMonth(year, month, weekday) {
  const lastDay = daysInMonth(year, month);
  const lastWeekday = weekdayForCalendarDate(year, month, lastDay);
  const distance = (lastWeekday - weekday + 7) % 7;
  return lastDay - distance;
}

function nthWeekdayDayOfMonth(year, month, weekday, occurrence) {
  const firstWeekday = weekdayForCalendarDate(year, month, 1);
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (Math.max(1, occurrence) - 1) * 7;
  return day > daysInMonth(year, month)
    ? lastWeekdayDayOfMonth(year, month, weekday)
    : day;
}

/**
 * Advance one business-calendar month while preserving the selected weekday
 * occurrence. Host/server timezone never participates in the calculation.
 */
function addCalendarMonthPreservingWeekdayOccurrence(
  value,
  preferredWeekday,
  timeZone = SUBSCRIPTION_TIME_ZONE,
) {
  const sourceParts = zonedParts(value, timeZone);
  if (!sourceParts) {
    throw new TypeError("A valid delivery date is required");
  }

  const fallbackWeekday = weekdayInTimeZone(value, timeZone);
  const weekday = normalizeWeekday(preferredWeekday, fallbackWeekday);

  const targetMonthCursor = new Date(
    Date.UTC(sourceParts.year, sourceParts.month, 1),
  );
  const targetYear = targetMonthCursor.getUTCFullYear();
  const targetMonth = targetMonthCursor.getUTCMonth() + 1;

  const targetDay = isLastWeekSlot(sourceParts)
    ? lastWeekdayDayOfMonth(targetYear, targetMonth, weekday)
    : nthWeekdayDayOfMonth(
        targetYear,
        targetMonth,
        weekday,
        weekdayOccurrence(sourceParts),
      );

  return zonedDateTimeToUtc(
    {
      year: targetYear,
      month: targetMonth,
      day: targetDay,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
}

module.exports = {
  addCalendarMonthPreservingWeekdayOccurrence,
};
