/**
 * Time / timezone utilities for route generation.
 * Converts local delivery-window times into UTC ISO strings.
 */

const { isHHMM } = require("./routeValidation.util");

const DELIVERY_TIME_ZONE =
  process.env.DELIVERY_TIME_ZONE ||
  process.env.BUSINESS_TIME_ZONE ||
  "Europe/London";

/**
 * Returns the difference (ms) between the local wall-clock time in `timeZone`
 * and UTC for the given `date`, using Intl iteration to handle DST boundaries.
 */
function getTimeZoneOffsetMs(date, timeZone) {
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

  const parts = dtf.formatToParts(date);
  const map = {};

  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  let hour = Number(map.hour);
  if (hour === 24) hour = 0;

  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );

  return asUTC - date.getTime();
}

/**
 * Converts a "HH:MM" local time on the same calendar date as `batchDeliveryDate`
 * into a UTC ISO string, accounting for DST via iterative offset correction.
 */
function toUtcIsoOnBatchDate(batchDeliveryDate, hhmm, timeZone) {
  if (!isHHMM(hhmm)) return null;

  const base = new Date(batchDeliveryDate);
  if (Number.isNaN(base.getTime())) return null;

  const [hh, mm] = hhmm.split(":").map(Number);

  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = base.getUTCDate();

  const utcGuess = new Date(Date.UTC(year, month, day, hh, mm, 0, 0));

  // Iterate up to 3 times to correct for DST offset at the target moment.
  let corrected = utcGuess;
  for (let i = 0; i < 3; i++) {
    const offset = getTimeZoneOffsetMs(corrected, timeZone);
    const next = new Date(utcGuess.getTime() - offset);
    if (next.getTime() === corrected.getTime()) break;
    corrected = next;
  }

  return corrected.toISOString();
}

/**
 * Parses a duration that may be a number (seconds) or a string like "5s", "2m", "1h".
 * Always returns a non-negative integer number of seconds.
 */
function parseDurationSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();

    if (trimmed.endsWith("s")) {
      const n = Number.parseFloat(trimmed.slice(0, -1));
      return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    }

    const n = Number.parseFloat(trimmed);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }

  return 0;
}

/**
 * Resolves the globalStartTime / globalEndTime pair for a Google route-optimization
 * request.  Precedence: explicit param → batch field → sensible fallback.
 */
function resolveOptimizationWindow({ batch, startTime, endTime }) {
  const startCandidate =
    typeof startTime === "string" && startTime.trim()
      ? startTime.trim()
      : typeof batch?.deliveryWindowStart === "string" &&
          batch.deliveryWindowStart.trim()
        ? batch.deliveryWindowStart.trim()
        : undefined;

  const endCandidate =
    typeof endTime === "string" && endTime.trim()
      ? endTime.trim()
      : typeof batch?.deliveryWindowEnd === "string" &&
          batch.deliveryWindowEnd.trim()
        ? batch.deliveryWindowEnd.trim()
        : undefined;

  const fallbackStartISO = new Date(batch.deliveryDate).toISOString();

  const coerceToISO = (value) => {
    if (typeof value !== "string" || !value.trim()) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  const startISO = startCandidate
    ? isHHMM(startCandidate)
      ? toUtcIsoOnBatchDate(
          batch.deliveryDate,
          startCandidate,
          DELIVERY_TIME_ZONE,
        )
      : coerceToISO(startCandidate)
    : null;

  const globalStartTime = startISO || fallbackStartISO;
  const start = new Date(globalStartTime);

  const endISO = endCandidate
    ? isHHMM(endCandidate)
      ? toUtcIsoOnBatchDate(
          batch.deliveryDate,
          endCandidate,
          DELIVERY_TIME_ZONE,
        )
      : coerceToISO(endCandidate)
    : null;

  let end;
  if (endISO) {
    end = new Date(endISO);
  } else {
    end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }

  // Guard: end must be after start.
  if (Number.isNaN(end.getTime()) || end <= start) {
    end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }

  return {
    globalStartTime: start.toISOString(),
    globalEndTime: end.toISOString(),
  };
}

module.exports = {
  parseDurationSeconds,
  resolveOptimizationWindow,
  toUtcIsoOnBatchDate,
  getTimeZoneOffsetMs,
};
