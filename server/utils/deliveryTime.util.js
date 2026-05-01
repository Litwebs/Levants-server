"use strict";

const LONDON_TZ = "Europe/London";

const roundToNearestMinutes = (date, minutes) => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  const stepMs = Number(minutes) * 60 * 1000;
  if (!Number.isFinite(stepMs) || stepMs <= 0) return null;
  return new Date(Math.round(date.getTime() / stepMs) * stepMs);
};

/**
 * Returns the offset (ms) between the local wall-clock time in `timeZone` and
 * UTC for the given `date`.  Positive during BST (UTC+1 → +3 600 000 ms).
 * Uses Intl.DateTimeFormat.formatToParts so it correctly tracks DST transitions.
 */
function getTzOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - date.getTime();
}

/**
 * Formats a UTC Date as "HH:MM" in Europe/London local time, correctly
 * adapting to GMT/BST transitions without relying on toLocaleTimeString
 * (which can silently ignore the timeZone option in Node.js builds that
 * lack full ICU data).
 */
const formatUkTime = (date) => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "";
  const offsetMs = getTzOffsetMs(date, LONDON_TZ);
  const local = new Date(date.getTime() + offsetMs);
  const h = String(local.getUTCHours()).padStart(2, "0");
  const m = String(local.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
};

const formatUkDate = (date) => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: LONDON_TZ,
  });
};

module.exports = {
  LONDON_TZ,
  roundToNearestMinutes,
  formatUkTime,
  formatUkDate,
};
