"use strict";
const crypto = require("crypto");
const Customer = require("../../models/customer.model");
const stripe = require("../../utils/stripe.util");
const { withLease } = require("../../utils/subscriptionLease.util");
const { listAllStripePages } = require("../../utils/stripePagination.util");

async function ensureCustomerIdentity(customerId) {
  const select = "_id email firstName lastName stripeCustomerId +stripeCustomerCreation";
  const existing = await Customer.findById(customerId).select(select);
  if (!existing || existing.stripeCustomerId) return existing;
  const token = crypto.randomUUID();
  const now = new Date();
  const customer = await Customer.findOneAndUpdate({ _id: customerId,
    $or: [{ paymentMethodLock: null }, { "paymentMethodLock.expiresAt": { $lte: now } }],
  }, { $set: { paymentMethodLock: { token, expiresAt: new Date(now.getTime() + 120000) } } },
  { new: true }).select(select);
  if (!customer) {
    const latest = await Customer.findById(customerId).select(select);
    if (latest?.stripeCustomerId) return latest;
    throw Object.assign(new Error("Customer payment setup is in progress. Please retry shortly."), {
      statusCode: 503, code: "SUBSCRIPTION_LIFECYCLE_BUSY",
    });
  }
  const owned = { _id: customer._id, "paymentMethodLock.token": token };
  try {
    return await withLease({ kind: "customer", id: customer._id, token }, async () => {
      if (customer.stripeCustomerId) return customer;
      let plan = customer.stripeCustomerCreation;
      if (!plan) {
        const id = crypto.randomUUID();
        plan = { id, startedAt: now.toISOString(), key: `customer:${customer._id}:stripe-profile:${id}`,
          params: { email: customer.email || undefined,
            name: `${customer.firstName || ""} ${customer.lastName || ""}`.trim(),
            metadata: { customerId: String(customer._id), profileOperationId: id } } };
        const saved = await Customer.updateOne(owned, { $set: { stripeCustomerCreation: plan } });
        if (saved.matchedCount !== 1) throw new Error("Customer setup ownership was lost before saving its request.");
      }
      let remote;
      if (Date.now() - Date.parse(plan.startedAt) >= 23 * 3600000) {
        const matches = (await listAllStripePages(params => stripe.customers.list(params), {}))
          .filter(candidate => !candidate.deleted && candidate.metadata?.customerId === String(customer._id) &&
            candidate.metadata?.profileOperationId === plan.id);
        if (matches.length !== 1) throw new Error("This aged customer setup needs reconciliation; another Stripe customer will not be created.");
        remote = matches[0];
      } else {
        remote = await stripe.customers.create(plan.params, { idempotencyKey: plan.key });
      }
      if (!remote?.id || remote.deleted) throw new Error("Stripe customer setup was not confirmed.");
      const completed = await Customer.updateOne(owned, { $set: { stripeCustomerId: remote.id, stripeCustomerCreation: null } });
      if (completed.matchedCount !== 1) throw new Error("Customer setup could not be committed. Retry the original setup.");
      customer.stripeCustomerId = remote.id;
      return customer;
    });
  } finally {
    await Customer.updateOne(owned, { $set: { paymentMethodLock: null } });
  }
}
module.exports = { ensureCustomerIdentity };
