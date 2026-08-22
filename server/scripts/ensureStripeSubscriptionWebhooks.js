"use strict";

// Checks (default) or repairs (--apply) the enabled Stripe webhook endpoint.
// Existing event subscriptions are preserved; required subscription events are
// merged in. Pass --endpoint we_... when an account has multiple endpoints.

const env = require("../config/env");
const Stripe = require("stripe");

const stripe = new Stripe(env.stripe.secretKey, {
  apiVersion: env.stripe.apiVersion,
});

const REQUIRED_EVENTS = [
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const requestedId = argument("--endpoint");
  const apply = process.argv.includes("--apply");
  const page = await stripe.webhookEndpoints.list({ limit: 100 });
  const candidates = (page.data || []).filter(
    (endpoint) =>
      endpoint.status === "enabled" &&
      (!requestedId || endpoint.id === requestedId),
  );
  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one enabled webhook endpoint, found ${candidates.length}. Pass --endpoint we_... explicitly.`,
    );
  }

  const endpoint = candidates[0];
  const current = endpoint.enabled_events || [];
  const missing = current.includes("*")
    ? []
    : REQUIRED_EVENTS.filter((event) => !current.includes(event));
  console.log(
    JSON.stringify({
      endpointId: endpoint.id,
      status: endpoint.status,
      missingEvents: missing,
      apply,
    }),
  );
  if (!apply || missing.length === 0) return;

  await stripe.webhookEndpoints.update(endpoint.id, {
    enabled_events: [...new Set([...current, ...REQUIRED_EVENTS])].sort(),
  });
  console.log(
    JSON.stringify({ endpointId: endpoint.id, updated: true, added: missing }),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
