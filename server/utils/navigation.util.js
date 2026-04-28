function generateGoogleMapsLink(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function normalizeBaseUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, "");

  if (process.env.NODE_ENV !== "production") {
    return `http://${value.replace(/\/$/, "")}`;
  }

  return value.replace(/\/$/, "");
}

module.exports = {
  generateGoogleMapsLink,
  normalizeBaseUrl,
};
