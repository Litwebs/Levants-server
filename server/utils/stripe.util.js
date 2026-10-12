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

const stripe = new Stripe(secretKey || process.env.STRIPE_SECRET_KEY, {
  apiVersion: apiVersion || process.env.STRIPE_API_VERSION,
  ...require("./uatStripeOptions").uatStripeOptions(),
});

// Financial commands are sent only by the current lease owner. Their durable
// operation plans retain the same Stripe idempotency key across worker retry.
const { fenceLease } = require("./subscriptionLease.util");
for (const [resource, methods] of Object.entries({
  paymentIntents: ["create", "confirm", "cancel"], refunds: ["create"],
  invoices: ["update", "voidInvoice", "finalizeInvoice"],
  subscriptions: ["create", "update", "cancel"], customers: ["create", "update"],
  paymentMethods: ["attach", "detach"], products: ["create"], prices: ["create", "update"],
})) {
  for (const method of methods) {
    if (typeof stripe[resource]?.[method] !== "function") continue;
    stripe[resource][method] = new Proxy(stripe[resource][method], {
      async apply(command, receiver, args) { await fenceLease(); return Reflect.apply(command, receiver, args); },
    });
  }
}
module.exports = stripe;
