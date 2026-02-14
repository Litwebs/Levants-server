const Stripe = require("stripe");

let apiVersion;
let secretKey;

try {
  // Prefer the central env config if present.
  const env = require("../config/env");
  apiVersion = env?.stripe?.apiVersion;
  secretKey = env?.stripe?.secretKey;
} catch {
  // ignore
}

module.exports = new Stripe(secretKey || process.env.STRIPE_SECRET_KEY, {
  apiVersion: apiVersion || process.env.STRIPE_API_VERSION,
});
