"use strict";

const { test, expect } = require("@playwright/test");
const {
  API_ORIGIN,
  createFixture,
  failNextStripePriceSyncs,
  getState,
  login,
  portalHeaders,
  reconcileStripePrice,
  reset,
} = require("../support/e2e-client");

function id(value) {
  return String(value || "");
}

function quantity(items, variantId) {
  const item = (items || []).find(
    (candidate) => id(candidate.variant) === id(variantId),
  );
  return Number(item?.quantity || 0);
}

function modificationIntents(state) {
  return (state.stripe.paymentIntents || []).filter(
    (intent) =>
      intent.metadata?.type === "subscription_modification" &&
      id(intent.metadata?.subscriptionId) === id(state.subscription._id),
  );
}

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test.afterAll(async ({ request }) => {
  await reset(request);
});

test("recurring price sync failure is marked pending and reconciliation repairs Stripe without charging twice", async ({
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    funds: "sufficient",
  });
  const token = await login(request, fixture.credentials);
  const before = await getState(request, fixture.subscriptionId);
  const originalRemotePriceId = before.stripe.remoteSubscription.currentPriceId;
  const originalEggQuantity = quantity(
    before.subscription.items,
    fixture.variants.EGGS.id,
  );

  // One failure hits the legacy service sync attempt and the second hits the
  // controller-level integrity reconciliation. The API must persist a durable
  // pending marker instead of silently pretending billing is synchronized.
  await failNextStripePriceSyncs(request, fixture.subscriptionId, 2);

  const response = await request.post(
    `${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}/items`,
    {
      headers: portalHeaders(token),
      data: { variantId: fixture.variants.EGGS.id, quantity: 1 },
      timeout: 60_000,
    },
  );
  const body = await response.json();

  expect(response.ok(), body?.message || JSON.stringify(body)).toBe(true);
  expect(body.success).toBe(true);
  expect(body.data?.billingSync).toMatchObject({
    status: "pending",
    action: "pending",
  });
  expect(body.message).toMatch(/billing update is pending/i);

  const pending = await getState(request, fixture.subscriptionId);
  expect(
    quantity(pending.subscription.items, fixture.variants.EGGS.id),
  ).toBe(originalEggQuantity + 1);
  expect(pending.subscription.pendingPriceSync).toBe(true);
  expect(pending.subscription.stripePriceId).toBe(originalRemotePriceId);
  expect(pending.stripe.remoteSubscription.currentPriceId).toBe(
    originalRemotePriceId,
  );

  const chargedOnce = modificationIntents(pending);
  expect(chargedOnce).toHaveLength(1);
  expect(chargedOnce[0].status).toBe("succeeded");

  const repair = await reconcileStripePrice(request, fixture.subscriptionId);
  expect(repair).toMatchObject({ ok: true, action: "repaired" });

  const repaired = await getState(request, fixture.subscriptionId);
  expect(repaired.subscription.pendingPriceSync).toBe(false);
  expect(repaired.stripe.remoteSubscription.currentPriceId).not.toBe(
    originalRemotePriceId,
  );
  expect(repaired.subscription.stripePriceId).toBe(
    repaired.stripe.remoteSubscription.currentPriceId,
  );
  expect(
    quantity(repaired.subscription.items, fixture.variants.EGGS.id),
  ).toBe(originalEggQuantity + 1);
  expect(modificationIntents(repaired)).toHaveLength(1);

  // Re-running the repair is a no-op: no new recurring transition and no
  // duplicate one-off modification payment is created.
  const repairedPriceId = repaired.subscription.stripePriceId;
  const secondRepair = await reconcileStripePrice(request, fixture.subscriptionId);
  expect(secondRepair).toMatchObject({ ok: true, action: "synced" });

  const finalState = await getState(request, fixture.subscriptionId);
  expect(finalState.subscription.stripePriceId).toBe(repairedPriceId);
  expect(finalState.stripe.remoteSubscription.currentPriceId).toBe(
    repairedPriceId,
  );
  expect(modificationIntents(finalState)).toHaveLength(1);
});
