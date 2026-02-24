function normalizePostcode(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return {
      input: value,
      normalized: "",
      formatted: "",
      outwardCode: "",
    };
  }

  const normalized = value.toUpperCase().replace(/\s+/g, "");

  const inward = normalized.slice(-3);
  const hasInwardCode = normalized.length > 3 && /^\d[A-Z]{2}$/.test(inward);

  // If it's a full UK postcode, the last 3 chars are the inward code.
  // If the user provides only an outward code (e.g. "BD5"), we keep it as-is.
  const outwardCode = hasInwardCode ? normalized.slice(0, -3) : normalized;
  const formatted = hasInwardCode
    ? `${normalized.slice(0, -3)} ${inward}`
    : normalized;

  return {
    input: value,
    normalized,
    formatted,
    outwardCode,
  };
}

module.exports = {
  normalizePostcode,
};
