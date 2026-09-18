"use strict";

function normalizeWeekday(value, fallback) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) {
    return numeric;
  }
  return Number(fallback);
}

function startOfLocalDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function lastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function isLastWeekSlot(date) {
  return date.getDate() + 7 > lastDayOfMonth(date.getFullYear(), date.getMonth());
}

function weekdayOccurrence(date) {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

function lastWeekdayOfMonth(year, month, weekday) {
  const last = new Date(year, month + 1, 0);
  last.setHours(0, 0, 0, 0);
  const distance = (last.getDay() - weekday + 7) % 7;
  last.setDate(last.getDate() - distance);
  return last;
}

function nthWeekdayOfMonth(year, month, weekday, occurrence) {
  const first = new Date(year, month, 1);
  first.setHours(0, 0, 0, 0);
  const offset = (weekday - first.getDay() + 7) % 7;
  const day = 1 + offset + (Math.max(1, occurrence) - 1) * 7;
  const lastDay = lastDayOfMonth(year, month);

  if (day > lastDay) {
    return lastWeekdayOfMonth(year, month, weekday);
  }

  return new Date(year, month, day);
}

/**
 * Advance one calendar month while preserving the customer's selected weekday.
 *
 * The existing subscription contract is weekday-based, so monthly cadence keeps
 * the same ordinal weekday (for example, first Wednesday -> first Wednesday).
 * A delivery in the final week of a month remains on the last selected weekday
 * of following months. This avoids fixed 30-day drift while keeping the existing
 * preferred-delivery-day rule intact.
 */
function addCalendarMonthPreservingWeekdayOccurrence(
  value,
  preferredWeekday,
) {
  const source = startOfLocalDay(value);
  if (Number.isNaN(source.getTime())) {
    throw new TypeError("A valid delivery date is required");
  }

  const weekday = normalizeWeekday(preferredWeekday, source.getDay());
  const targetMonth = new Date(
    source.getFullYear(),
    source.getMonth() + 1,
    1,
  );
  targetMonth.setHours(0, 0, 0, 0);

  if (isLastWeekSlot(source)) {
    return lastWeekdayOfMonth(
      targetMonth.getFullYear(),
      targetMonth.getMonth(),
      weekday,
    );
  }

  return nthWeekdayOfMonth(
    targetMonth.getFullYear(),
    targetMonth.getMonth(),
    weekday,
    weekdayOccurrence(source),
  );
}

module.exports = {
  addCalendarMonthPreservingWeekdayOccurrence,
};
