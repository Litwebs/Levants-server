"use strict";
const REQUIRED_EVENTS = [
  "invoice.created", "invoice.voided", "invoice.marked_uncollectible",
  "invoice.payment_succeeded", "invoice.payment_failed",
  "customer.subscription.updated", "customer.subscription.deleted",
  "refund.created", "refund.updated", "refund.failed",
];
function checkSubscriptionEndpoints(endpoints, requestedId) {
  const candidates = endpoints.filter(endpoint => endpoint.status === "enabled" &&
    (!requestedId || endpoint.id === requestedId));
  const endpoint = candidates.length === 1 ? candidates[0] : null;
  const missingEvents = endpoint?.enabled_events?.includes("*") ? [] :
    REQUIRED_EVENTS.filter(event => !endpoint?.enabled_events?.includes(event));
  return { ok: Boolean(endpoint) && missingEvents.length === 0,
    endpointId: endpoint?.id || null, ambiguous: candidates.length !== 1, missingEvents };
}
module.exports = { REQUIRED_EVENTS, checkSubscriptionEndpoints };
