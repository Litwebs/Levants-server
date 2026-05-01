/**
 * Pure coordinate / format validators used by route generation.
 * No external dependencies, safe to import anywhere.
 */

function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function isValidLatLng(lat, lng) {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

/** Checks if value is a "HH:MM" 24-hour string. */
function isHHMM(value) {
  if (typeof value !== "string") return false;
  if (!/^\d{2}:\d{2}$/.test(value)) return false;

  const [hh, mm] = value.split(":").map(Number);

  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return false;
  if (hh < 0 || hh > 23) return false;
  if (mm < 0 || mm > 59) return false;

  return true;
}

module.exports = { isFiniteNumber, isValidLatLng, isHHMM };
