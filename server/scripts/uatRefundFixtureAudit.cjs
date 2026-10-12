"use strict";
const assert = require("node:assert/strict");

// Read-only provider reconciliation. No create/update/delete Stripe calls and
// no database access. The caller supplies one explicitly approved UAT fixture.
module.exports = async function auditUatRefundFixture(stripe, fixture) {
  assert.equal((await stripe.balance.retrieve()).livemode, false);
  const original = await stripe.paymentIntents.retrieve(fixture.initialPaymentIntentId);
  assert.equal(original.livemode, false);
  assert.equal(original.currency, "gbp");
  assert.equal(original.status, "succeeded");
  assert.equal(original.amount_received, fixture.initialMinor);
  assert.match(fixture.subscriptionId, /^[0-9a-f]{24}$/);
  const found = await stripe.paymentIntents.search({
    query: "metadata['subscriptionId']:'" + fixture.subscriptionId + "' AND status:'succeeded'",
    limit: 100,
  });
  assert.equal(found.has_more, false);
  const intents = new Map([[original.id, original]]);
  for (const intent of found.data) {
    assert.equal(intent.livemode, false);
    assert.equal(intent.customer, original.customer);
    assert.equal(intent.metadata.subscriptionId, fixture.subscriptionId);
    intents.set(intent.id, intent);
  }
  assert.equal(intents.size, 3);
  const modifications = [...intents.values()].filter(p => p.metadata.type === "subscription_modification");
  const addOns = [...intents.values()].filter(p => p.metadata.type === "delivery_add_on");
  assert.equal(modifications.length, 1);
  assert.equal(addOns.length, 1);
  assert.equal(modifications[0].amount_received, fixture.increaseMinor);
  assert.equal(addOns[0].amount_received, fixture.addOnMinor);
  const rows = [];
  for (const intent of intents.values()) {
    assert.equal(intent.currency, "gbp");
    assert.equal(intent.status, "succeeded");
    const refunds = await stripe.refunds.list({ payment_intent: intent.id, limit: 100 });
    assert.equal(refunds.has_more, false);
    for (const refund of refunds.data) {
      assert.equal(refund.payment_intent, intent.id);
      assert.equal(refund.currency, "gbp");
      assert.equal(refund.status, "succeeded");
    }
    const returned = refunds.data.reduce((sum, r) => sum + r.amount, 0);
    assert.equal(returned, intent.amount_received);
    const charge = await stripe.charges.retrieve(
      typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge.id,
    );
    assert.equal(charge.livemode, false);
    assert.equal(charge.refunded, true);
    assert.equal(charge.amount_refunded, intent.amount_received);
    rows.push({
      type: intent.id === original.id ? "initial" : intent.metadata.type,
      collectedMinor: intent.amount_received,
      refundedMinor: returned,
      remainingMinor: 0,
      refundCount: refunds.data.length,
    });
  }
  const collected = rows.reduce((sum, row) => sum + row.collectedMinor, 0);
  const refunded = rows.reduce((sum, row) => sum + row.refundedMinor, 0);
  assert.equal(collected, fixture.initialMinor + fixture.increaseMinor + fixture.addOnMinor);
  assert.equal(refunded, collected);
  return { fixture: fixture.subscriptionNumber, mode: "sandbox", readOnly: true,
    payments: rows, collectedMinor: collected, refundedMinor: refunded,
    remainingMinor: 0, success: true };
};
