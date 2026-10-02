"use strict";
const mongoose = require("mongoose");
const PaymentMethod = require("../../models/paymentMethod.model");
const Subscription = require("../../models/subscription.model");
const stripe = require("../../utils/stripe.util");
const idOf = value => typeof value === "string" ? value : value?.id || null;

async function liveStripeSubscriptions(customerId) {
  const subscriptions = [];
  let cursor;
  do {
    const page = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100,
      ...(cursor ? { starting_after: cursor } : {}),
    });
    subscriptions.push(...page.data.filter(sub => !["canceled", "incomplete_expired"].includes(sub.status)));
    if (!page.has_more) break;
    const next = page.data.at(-1)?.id;
    if (!next || next === cursor) throw new Error("Subscription pagination did not advance");
    cursor = next;
  } while (true);
  return subscriptions;
}

async function setCustomerDefaultCard(customer, method, verifiedStripeMethod) {
  if (method.provider !== "stripe" || !method.providerReference) throw new Error("Please choose a saved Stripe card");
  const card = verifiedStripeMethod || await stripe.paymentMethods.retrieve(method.providerReference);
  if (card.type !== "card" || idOf(card.customer) !== customer.stripeCustomerId) {
    throw new Error("This card is not attached to your Stripe customer");
  }
  // Clear historical per-subscription overrides before changing the customer
  // default. If a remote update fails, the customer still keeps the old default;
  // retries repeat these non-charging assignments safely.
  const subscriptions = await liveStripeSubscriptions(customer.stripeCustomerId);
  for (const subscription of subscriptions) {
    if (subscription.default_payment_method || subscription.default_source) {
      await stripe.subscriptions.update(subscription.id, {
        default_payment_method: "", default_source: "",
      });
    }
  }
  await stripe.customers.update(customer.stripeCustomerId, {
    invoice_settings: { default_payment_method: method.providerReference },
  });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await PaymentMethod.updateMany({ customer: customer._id, isDefault: true },
        { $set: { isDefault: false } }, { session });
      const selected = await PaymentMethod.updateOne({ _id: method._id, customer: customer._id },
        { $set: { isDefault: true } }, { session });
      if (!selected.matchedCount) throw new Error("The selected card is no longer saved");
      await Subscription.updateMany({ customer: customer._id, status: { $in: ["active", "paused"] } },
        { $set: { paymentMethod: method._id } }, { session });
    });
  } finally { await session.endSession(); }
  method.isDefault = true;
}

async function cardIsUsedBySubscription(customer, method) {
  const subscriptions = await liveStripeSubscriptions(customer.stripeCustomerId);
  if (!subscriptions.length) return false;
  const remoteCustomer = await stripe.customers.retrieve(customer.stripeCustomerId);
  const customerDefault = idOf(remoteCustomer.invoice_settings?.default_payment_method) || idOf(remoteCustomer.default_source);
  return subscriptions.some(subscription => {
    const effectiveCard = idOf(subscription.default_payment_method) || idOf(subscription.default_source) || customerDefault;
    // Unknown backing is not evidence that removing the customer's default is safe.
    return effectiveCard === method.providerReference || (!effectiveCard && method.isDefault);
  });
}
module.exports = { setCustomerDefaultCard, cardIsUsedBySubscription, liveStripeSubscriptions };
