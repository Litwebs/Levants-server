const axios = require("axios");

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

function buildAddressString(address) {
  return [
    address.line1,
    address.line2,
    address.city,
    address.postcode,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
}

async function geocodeAddress(address) {
  const fullAddress = buildAddressString(address);

  const { data } = await axios.get(
    "https://maps.googleapis.com/maps/api/geocode/json",
    {
      params: {
        address: fullAddress,
        key: GOOGLE_API_KEY,
      },
    },
  );

  if (!data.results || data.results.length === 0) {
    throw new Error("Unable to geocode address");
  }

  const location = data.results[0].geometry.location;

  return {
    lat: location.lat,
    lng: location.lng,
  };
}

module.exports = {
  geocodeAddress,
};
