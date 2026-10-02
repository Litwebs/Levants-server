"use strict";
const stripe = require("../../utils/stripe.util");
const Mutation = require("../../models/subscriptionMutation.model");
const clock = require("../../utils/subscriptionClock.util");

async function recoverAddOnPayment(mutation) {
  const snapshot = mutation.addOnSnapshot;
  let intent = snapshot.paymentIntent;
  try {
    if (intent && intent.status !== "succeeded") {
      intent = await stripe.paymentIntents.retrieve(intent.id);
    } else if (!intent) {
      if (clock.now() - new Date(snapshot.startedAt).getTime() >= 23 * 3600000) {
        return { ok: false, message: "This add-on payment needs reconciliation. Please contact support before trying another purchase." };
      }
      intent = await stripe.paymentIntents.create(snapshot.chargeParams, { idempotencyKey: snapshot.idempotencyKey });
    }
  } catch (error) {
    // Preserve a known intent even when Stripe reports its status as an error.
    intent = error.payment_intent;
    if (!intent) return { ok: false, message: error.message || "Could not confirm the add-on payment. Retry the same request." };
  }
  if (!intent?.id) return { ok: false, message: "Could not confirm the add-on payment." };
  await Mutation.updateOne({ _id: mutation._id }, { $set: { "addOnSnapshot.paymentIntent": intent } });
  snapshot.paymentIntent = intent;
  return intent.status === "succeeded"
    ? { ok: true, paymentIntent: intent }
    : { ok: false, message: "The original add-on payment has not succeeded. Please contact support; another charge will not be created." };
}
module.exports = { recoverAddOnPayment };
