"use strict";
const stripe = require("../../utils/stripe.util");
const { listAllStripePages } = require("../../utils/stripePagination.util");
const idOf = value => typeof value === "string" ? value : value?.id;

async function findFrozenPayment(snapshot) {
  const params = snapshot.chargeParams;
  const identity = params?.metadata;
  if (!params?.customer || !identity?.operationId || !identity?.subscriptionId || !identity?.type) {
    throw new Error("The original payment identity is missing; support reconciliation is required.");
  }
  const intents = await listAllStripePages(page => stripe.paymentIntents.list(page), { customer: params.customer });
  const matching = intents.filter(intent => Object.entries(identity)
    .every(([key, value]) => intent.metadata?.[key] === String(value)));
  const capturedOrPending = matching.filter(intent =>
    !(intent.status === "requires_payment_method" && intent.amount_received === 0) && intent.status !== "canceled");
  if (capturedOrPending.length !== 1) {
    throw new Error("The original payment outcome is ambiguous; another charge will not be created.");
  }
  const intent = capturedOrPending[0];
  if (idOf(intent.customer) !== params.customer || intent.currency !== params.currency ||
      intent.amount !== params.amount || (intent.status === "succeeded" && intent.amount_received !== params.amount)) {
    throw new Error("The recovered payment does not match its saved customer, currency and amount.");
  }
  return intent;
}
module.exports = { findFrozenPayment };
