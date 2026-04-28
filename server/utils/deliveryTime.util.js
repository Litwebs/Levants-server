"use strict";

const LONDON_TZ = "Europe/London";

const roundToNearestMinutes = (date, minutes) => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  const stepMs = Number(minutes) * 60 * 1000;
  if (!Number.isFinite(stepMs) || stepMs <= 0) return null;
  return new Date(Math.round(date.getTime() / stepMs) * stepMs);
};

const formatUkTime = (date) => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LONDON_TZ,
  });
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
