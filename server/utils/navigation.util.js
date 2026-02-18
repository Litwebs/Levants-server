function generateGoogleMapsLink(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

module.exports = {
  generateGoogleMapsLink,
};
