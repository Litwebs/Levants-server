function isHHMM(value) {
  if (typeof value !== "string") return false;
  if (!/^\d{2}:\d{2}$/.test(value)) return false;

  const [hh, mm] = value.split(":").map(Number);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return false;
  if (hh < 0 || hh > 23) return false;
  if (mm < 0 || mm > 59) return false;

  return true;
}

function normalizeRoutingArea(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, "").trim().toUpperCase();
}

function normalizeRoutingAreas(values) {
  if (!Array.isArray(values)) return [];

  const seen = new Set();
  const normalized = [];

  for (const value of values) {
    const next = normalizeRoutingArea(value);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    normalized.push(next);
  }

  return normalized;
}

function splitRoutingAreas(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  return value
    .split(/[\n,;|]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeDriverRouting(input) {
  const postcodeAreas = normalizeRoutingAreas(
    splitRoutingAreas(input?.postcodeAreas),
  );

  const routeStartTime = isHHMM(String(input?.routeStartTime || "").trim())
    ? String(input.routeStartTime).trim()
    : null;

  return {
    postcodeAreas,
    routeStartTime,
  };
}

function parseUkPostcode(value) {
  const compact = normalizeRoutingArea(value);
  if (!compact) {
    return {
      compact: "",
      outward: "",
      area: "",
      inward: "",
      isValid: false,
    };
  }

  const match = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  const outward = match ? match[1] : compact;
  const inward = match ? match[2] : "";
  const area = (outward.match(/^[A-Z]+/) || [""])[0];

  return {
    compact,
    outward,
    area,
    inward,
    isValid: Boolean(match),
  };
}

function matchesRoutingArea(postcodeValue, routingArea) {
  const postcode =
    typeof postcodeValue === "string"
      ? parseUkPostcode(postcodeValue)
      : postcodeValue;

  const candidate = normalizeRoutingArea(routingArea);
  if (!candidate || !postcode?.compact) return false;

  if (candidate.endsWith("*")) {
    const prefix = candidate.slice(0, -1);
    if (!prefix) return false;
    return (
      postcode.outward.startsWith(prefix) || postcode.compact.startsWith(prefix)
    );
  }

  if (candidate === postcode.compact || candidate === postcode.outward) {
    return true;
  }

  if (/^[A-Z]+$/.test(candidate)) {
    return (
      postcode.area.startsWith(candidate) ||
      postcode.outward.startsWith(candidate)
    );
  }

  // District-style assignments such as E1, N4, EC1A should match the outward code exactly.
  if (/^[A-Z]{1,2}\d[A-Z\d]?$/.test(candidate)) {
    return postcode.outward === candidate;
  }

  return false;
}

module.exports = {
  isHHMM,
  normalizeRoutingArea,
  normalizeRoutingAreas,
  normalizeDriverRouting,
  parseUkPostcode,
  matchesRoutingArea,
};
