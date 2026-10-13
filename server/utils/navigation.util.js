function generateGoogleMapsLink(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

// HTTPS links allow the operating system to hand off to an installed app,
// while keeping a browser destination when that app is unavailable.
function generateNavigationLinks(location, address) {
  const lat = location?.lat;
  const lng = location?.lng;
  const hasCoordinates = typeof lat === "number" && Number.isFinite(lat) &&
    Math.abs(lat) <= 90 && typeof lng === "number" && Number.isFinite(lng) &&
    Math.abs(lng) <= 180;
  const addressText = [address?.line1, address?.line2, address?.city,
    address?.postcode, address?.country]
    .filter((part) => typeof part === "string" && part.trim())
    .map((part) => part.trim()).join(", ");
  const destination = hasCoordinates ? `${lat},${lng}` : addressText;
  if (!destination) return null;
  const encoded = encodeURIComponent(destination);
  return {
    googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`,
    appleMaps: `https://maps.apple.com/?daddr=${encoded}&dirflg=d`,
    waze: `https://waze.com/ul?${hasCoordinates ? "ll" : "q"}=${encoded}&navigate=yes&utm_source=levants`,
  };
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
  generateNavigationLinks,
  normalizeBaseUrl,
};
