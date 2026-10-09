"use strict";
const crypto = require("crypto");
const Subscription = require("../../models/subscription.model");
const Customer = require("../../models/customer.model");
const Payment = require("../../models/payment.model");
const stripe = require("../../utils/stripe.util");
const clock = require("../../utils/subscriptionClock.util");

const reference = value => typeof value === "string" ? value : value?.id;
function validateIntent(intent, plan) {
  validateIdentity(intent, plan);
  if (intent.status !== "succeeded" || Number(intent.amount_received) !== plan.amountMinor) {
    throw new Error("The resume payment has not succeeded. Retry the same resume; another charge will not be created.");
  }
}
function validateIdentity(intent, plan) {
  if (!intent?.id || reference(intent.customer) !== plan.chargeParams.customer ||
      intent.currency?.toLowerCase() !== plan.chargeParams.currency ||
      Number(intent.amount) !== plan.amountMinor) {
    throw new Error("The resume payment does not match its saved plan. Please contact support.");
  }
}
async function savePlan(subscription, plan) {
  const saved = await Subscription.updateOne({ _id: subscription._id, status: "paused" },
    { $set: { resumePaymentPlan: plan } });
  if (!saved.matchedCount) throw new Error("The resume payment plan could not be saved.");
  subscription.resumePaymentPlan = plan;
}
async function prepareResumePayment(subscription, { nextDeliveryDate, amountMinor, orderId, operationId }) {
  if (subscription.resumePaymentPlan && !subscription.resumePaymentPlan.completedAt) return subscription.resumePaymentPlan;
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error("Invalid resume payment amount.");
  const plan = { id: crypto.randomUUID(), nextDeliveryDate, amountMinor, orderId: orderId || null,
    operationId: operationId || null, baseVersion: Number(subscription.customerVersion || 0),
    startedAt: new Date(clock.now()) };
  if (amountMinor) {
    const customer = await Customer.findById(subscription.customer);
    if (!customer?.stripeCustomerId) throw new Error("No payment method on file.");
    const remote = await stripe.customers.retrieve(customer.stripeCustomerId);
    const method = reference(remote?.invoice_settings?.default_payment_method);
    if (remote.deleted || !method) throw new Error("Please add a default card first.");
    plan.idempotencyKey = `subscription:${subscription._id}:resume:${plan.id}`;
    plan.chargeParams = { amount: amountMinor, currency: "gbp", customer: customer.stripeCustomerId,
      payment_method: method, off_session: true, confirm: true,
      description: `Subscription resumed – ${subscription.subscriptionNumber}`,
      metadata: { subscriptionId: String(subscription._id), subscriptionNumber: subscription.subscriptionNumber,
        type: "subscription_modification", resumePlanId: plan.id } };
  }
  await savePlan(subscription, plan);
  return plan;
}
async function recoverResumePayment(subscription, plan) {
  if (!plan.amountMinor) return null;
  let intent;
  try {
    if (plan.paymentIntent?.id) {
      intent = await stripe.paymentIntents.retrieve(plan.paymentIntent.id);
      validateIdentity(intent, plan);
      if (intent.status === "requires_payment_method" && intent.amount_received === 0) {
        const remote = await stripe.customers.retrieve(plan.chargeParams.customer);
        const method = reference(remote?.invoice_settings?.default_payment_method);
        if (remote.deleted || !method) throw new Error("Please add a default card first.");
        plan.paymentIntent = null;
        plan.chargeParams = { ...plan.chargeParams, payment_method: method };
        plan.idempotencyKey = `subscription:${subscription._id}:resume:${plan.id}:retry:${crypto.randomUUID()}`;
        plan.startedAt = new Date(clock.now());
        await savePlan(subscription, plan);
        intent = await stripe.paymentIntents.create(plan.chargeParams, { idempotencyKey: plan.idempotencyKey });
      }
    } else if (clock.now() - new Date(plan.startedAt).getTime() >= 23 * 3600000) {
      // The provider may have discarded the idempotency key. Search every page
      // for the exact saved operation; never create a second aged charge.
      const matches = [];
      let cursor;
      do {
        const page = await stripe.paymentIntents.list({ customer: plan.chargeParams.customer, limit: 100,
          ...(cursor ? { starting_after: cursor } : {}) });
        matches.push(...page.data.filter(candidate => candidate.metadata?.resumePlanId === plan.id));
        if (!page.has_more) break;
        const next = page.data.at(-1)?.id;
        if (!next || next === cursor) throw new Error("Resume payment history pagination did not advance.");
        cursor = next;
      } while (true);
      if (matches.length !== 1) throw new Error("The old resume payment needs reconciliation. Please contact support.");
      intent = matches[0];
    } else {
      intent = await stripe.paymentIntents.create(plan.chargeParams, { idempotencyKey: plan.idempotencyKey });
    }
  } catch (error) {
    if (!error.payment_intent?.id) throw error;
    intent = error.payment_intent;
  }
  if (!intent?.id) throw new Error("Could not confirm the resume payment.");
  plan.paymentIntent = intent;
  await savePlan(subscription, plan);
  validateIntent(intent, plan);
  // Keep evidence of the accepted payment even if activation rolls back.
  await Payment.findOneAndUpdate({ subscription: subscription._id, providerReference: intent.id },
    { $setOnInsert: { customer: subscription.customer, subscription: subscription._id,
      order: plan.orderId, amount: plan.amountMinor / 100, currency: plan.chargeParams.currency,
      status: "paid", paidAt: new Date(clock.now()), providerReference: intent.id,
      notes: `Resume payment ${plan.id}` } }, { upsert: true, new: true });
  return intent;
}
module.exports = { prepareResumePayment, recoverResumePayment, validateIntent };
