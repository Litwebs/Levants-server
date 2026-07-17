"use strict";

const { test, expect } = require("@playwright/test");
const {
  API_ORIGIN,
  autoResume,
  createFixture,
  getState,
  login,
  portalHeaders,
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
  return state.stripe.paymentIntents.filter(
    (intent) =>
      intent.metadata?.type === "subscription_modification" &&
      id(intent.metadata?.subscriptionId) === id(state.subscription._id),
  );
}

function successfulPaymentSnapshot(state) {
  return state.stripe.paymentIntents
    .filter((intent) => intent.status === "succeeded")
    .map((intent) => ({
      id: intent.id,
      amount: Number(intent.amount),
      amountReceived: Number(intent.amountReceived),
      currency: intent.currency,
      invoice: intent.invoice || null,
      metadata: intent.metadata || {},
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function itemSnapshot(items) {
  return (items || [])
    .map((item) => ({
      id: id(item._id),
      product: id(item.product),
      variant: id(item.variant),
      name: item.name,
      sku: item.sku,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    }))
    .sort((left, right) => left.variant.localeCompare(right.variant));
}

function planSnapshot(plans) {
  return (plans || [])
    .map((plan) => ({
      day: Number(plan.day),
      items: itemSnapshot(plan.items),
    }))
    .sort((left, right) => left.day - right.day);
}

function pendingSnapshot(pending) {
  if (!pending) return null;
  return {
    items: itemSnapshot(pending.items),
    deliveryDayPlans: planSnapshot(pending.deliveryDayPlans),
    frequency: pending.frequency || null,
    preferredDeliveryDay: pending.preferredDeliveryDay ?? null,
    preferredDeliveryDays: pending.preferredDeliveryDays || [],
    deliveryAddress: pending.deliveryAddress || null,
    effectiveFrom: pending.effectiveFrom || null,
  };
}

function subscriptionMutationSnapshot(subscription) {
  return {
    status: subscription.status,
    frequency: subscription.frequency,
    preferredDeliveryDay: subscription.preferredDeliveryDay,
    preferredDeliveryDays: subscription.preferredDeliveryDays || [],
    items: itemSnapshot(subscription.items),
    deliveryDayPlans: planSnapshot(subscription.deliveryDayPlans),
    pendingChanges: pendingSnapshot(subscription.pendingChanges),
    stripeProductId: subscription.stripeProductId,
    stripePriceId: subscription.stripePriceId,
  };
}

function orderSnapshot(orders) {
  return (orders || [])
    .map((order) => ({
      id: id(order._id),
      items: (order.items || [])
        .map((item) => ({
          product: id(item.product),
          variant: id(item.variant),
          name: item.name,
          sku: item.sku,
          price: Number(item.price),
          quantity: Number(item.quantity),
          subtotal: Number(item.subtotal),
        }))
        .sort((left, right) => left.variant.localeCompare(right.variant)),
      subtotal: Number(order.subtotal),
      total: Number(order.total),
      amountPaid: Number(order.amountPaid),
      status: order.status,
      stripePaymentIntentId: order.stripePaymentIntentId,
      refund: order.refund || null,
      refunds: order.refunds || [],
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function relevantRefunds(state) {
  return state.stripe.refunds.filter(
    (refund) =>
      id(refund.metadata?.subscriptionId) === id(state.subscription._id),
  );
}

async function responseBody(response) {
  return response.json().catch(() => ({}));
}

async function expectSuccessfulResponse(response) {
  const body = await responseBody(response);
  expect(response.ok(), body?.message || JSON.stringify(body)).toBe(true);
  expect(body.success).toBe(true);
  return body;
}

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test.afterAll(async ({ request }) => {
  await reset(request);
});

test("before-cutoff weekly to fortnightly change keeps Mongo and Stripe cadence synchronized", async ({
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    funds: "sufficient",
  });
  const token = await login(request, fixture.credentials);

  const response = await request.patch(
    `${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}`,
    {
      headers: portalHeaders(token),
      data: { frequency: "every_two_weeks" },
      timeout: 60_000,
    },
  );
  await expectSuccessfulResponse(response);

  const state = await getState(request, fixture.subscriptionId);
  expect(state.subscription.frequency).toBe("every_two_weeks");
  expect(state.subscription.pendingChanges).toBeNull();
  expect(state.stripe.remoteSubscription.interval).toBe("week");
  expect(state.stripe.remoteSubscription.intervalCount).toBe(2);
  expect(state.subscription.stripePriceId).toBe(
    state.stripe.remoteSubscription.currentPriceId,
  );
});

test("add before cutoff then cancel refunds the combined initial and delta charges to their real PaymentIntents", async ({
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    funds: "sufficient",
  });
  const token = await login(request, fixture.credentials);
  const headers = portalHeaders(token);
  const base = `${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}`;

  const addResponse = await request.post(`${base}/items`, {
    headers,
    data: { variantId: fixture.variants.EGGS.id, quantity: 1 },
    timeout: 60_000,
  });
  const addBody = await expectSuccessfulResponse(addResponse);
  expect(addBody.data.chargedMinor).toBe(200);

  const funded = await getState(request, fixture.subscriptionId);
  const initialIntent = funded.stripe.paymentIntents.find(
    (intent) => intent.id === fixture.initialPaymentIntentId,
  );
  const deltaIntents = modificationIntents(funded).filter(
    (intent) => intent.status === "succeeded",
  );

  expect(initialIntent).toMatchObject({
    id: fixture.initialPaymentIntentId,
    amount: 1_300,
    amountReceived: 1_300,
    currency: "gbp",
    status: "succeeded",
  });
  expect(deltaIntents).toHaveLength(1);
  expect(deltaIntents[0]).toMatchObject({
    amount: 200,
    amountReceived: 200,
    currency: "gbp",
    status: "succeeded",
  });
  expect(quantity(funded.subscription.items, fixture.variants.EGGS.id)).toBe(1);
  expect(funded.orders).toHaveLength(1);
  expect(Number(funded.orders[0].amountPaid)).toBe(15);

  const cancelResponse = await request.post(`${base}/cancel`, {
    headers,
    data: {
      reason: "E2E combined-payment cancellation refund",
      refundMethod: "refund",
    },
    timeout: 60_000,
  });
  const cancelBody = await expectSuccessfulResponse(cancelResponse);
  expect(cancelBody.data.refundedMinor).toBe(1_500);

  const cancelled = await getState(request, fixture.subscriptionId);
  const cancellationRefunds = relevantRefunds(cancelled).filter(
    (refund) =>
      refund.metadata?.type === "subscription_cancel_refund" &&
      refund.status === "succeeded",
  );
  const refundedByIntent = new Map();
  for (const refund of cancellationRefunds) {
    refundedByIntent.set(
      refund.paymentIntentId,
      (refundedByIntent.get(refund.paymentIntentId) || 0) +
        Number(refund.amount),
    );
  }

  expect(refundedByIntent).toEqual(
    new Map([
      [fixture.initialPaymentIntentId, 1_300],
      [deltaIntents[0].id, 200],
    ]),
  );
  expect(
    cancellationRefunds.reduce(
      (total, refund) => total + Number(refund.amount),
      0,
    ),
  ).toBe(1_500);
  expect(cancelled.subscription.status).toBe("cancelled");
  expect(cancelled.stripe.remoteSubscription.status).toBe("canceled");
});

test("card decrease refund exists in Stripe and in the linked local Order refund history", async ({
  request,
}) => {
  test.skip(
    process.env.E2E_USE_STRIPE_CLI !== "1",
    "Requires the managed Stripe CLI listener so the signed refund webhook reaches the isolated API",
  );

  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    funds: "sufficient",
  });
  const token = await login(request, fixture.credentials);

  const response = await request.patch(
    `${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}/items/${fixture.variants.MILK.itemId}`,
    {
      headers: portalHeaders(token),
      data: { quantity: 1, refundMethod: "refund" },
      timeout: 60_000,
    },
  );
  const body = await expectSuccessfulResponse(response);
  expect(body.data.refundedMinor).toBe(500);
  expect(body.data.creditedMinor).toBe(0);
  expect(body.data.stripeRefundId).toMatch(/^re_/);

  await expect
    .poll(
      async () => {
        const state = await getState(request, fixture.subscriptionId);
        return state.orders.some((order) =>
          (order.refunds || []).some(
            (refund) => refund.stripeRefundId === body.data.stripeRefundId,
          ),
        );
      },
      {
        timeout: 30_000,
        message: "Stripe refund was not linked into the local Order history",
      },
    )
    .toBe(true);

  const state = await getState(request, fixture.subscriptionId);
  const stripeRefund = relevantRefunds(state).find(
    (refund) => refund.id === body.data.stripeRefundId,
  );
  expect(stripeRefund).toMatchObject({
    amount: 500,
    currency: "gbp",
    status: "succeeded",
    paymentIntentId: fixture.initialPaymentIntentId,
    metadata: {
      subscriptionId: fixture.subscriptionId,
      type: "subscription_decrease_refund",
    },
  });

  const linkedOrder = state.orders.find((order) =>
    (order.refunds || []).some(
      (refund) => refund.stripeRefundId === stripeRefund.id,
    ),
  );
  expect(linkedOrder?.stripePaymentIntentId).toBe(
    fixture.initialPaymentIntentId,
  );
  expect(linkedOrder?.refunds).toContainEqual(
    expect.objectContaining({
      stripeRefundId: stripeRefund.id,
      paymentIntentId: fixture.initialPaymentIntentId,
      amount: 5,
      amountMinor: 500,
      status: "succeeded",
    }),
  );
});

test("declining add is atomic across Mongo, the Order snapshot, recurring Price, and successful PaymentIntents", async ({
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    funds: "insufficient",
  });
  const token = await login(request, fixture.credentials);
  const before = await getState(request, fixture.subscriptionId);

  const response = await request.post(
    `${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}/items`,
    {
      headers: portalHeaders(token),
      data: { variantId: fixture.variants.EGGS.id, quantity: 1 },
      timeout: 60_000,
    },
  );
  const body = await responseBody(response);
  expect(response.status()).toBe(400);
  expect(response.ok()).toBe(false);
  expect(body.success).toBe(false);
  expect(body.message || "").toMatch(/declin|fund|charge|payment/i);

  const after = await getState(request, fixture.subscriptionId);
  expect(subscriptionMutationSnapshot(after.subscription)).toEqual(
    subscriptionMutationSnapshot(before.subscription),
  );
  expect(orderSnapshot(after.orders)).toEqual(orderSnapshot(before.orders));
  expect(after.subscription.pendingChanges).toBeNull();
  expect(quantity(after.subscription.items, fixture.variants.EGGS.id)).toBe(0);
  expect(after.subscription.stripePriceId).toBe(
    before.subscription.stripePriceId,
  );
  expect(after.stripe.remoteSubscription).toMatchObject({
    currentPriceId: before.stripe.remoteSubscription.currentPriceId,
    interval: before.stripe.remoteSubscription.interval,
    intervalCount: before.stripe.remoteSubscription.intervalCount,
  });
  expect(successfulPaymentSnapshot(after)).toEqual(
    successfulPaymentSnapshot(before),
  );
  expect(
    modificationIntents(after).filter((intent) => intent.status === "succeeded"),
  ).toHaveLength(0);
});

test("funded edit replaces the recurring Price selected by both Mongo and Stripe and records the exact delta PaymentIntent", async ({
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    funds: "sufficient",
  });
  const token = await login(request, fixture.credentials);
  const before = await getState(request, fixture.subscriptionId);

  expect(before.subscription.stripePriceId).toBe(fixture.stripePriceId);
  expect(before.stripe.remoteSubscription.currentPriceId).toBe(
    fixture.stripePriceId,
  );

  const response = await request.post(
    `${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}/items`,
    {
      headers: portalHeaders(token),
      data: { variantId: fixture.variants.EGGS.id, quantity: 1 },
      timeout: 60_000,
    },
  );
  const body = await expectSuccessfulResponse(response);
  expect(body.data.chargedMinor).toBe(200);

  const after = await getState(request, fixture.subscriptionId);
  expect(quantity(after.subscription.items, fixture.variants.EGGS.id)).toBe(1);
  expect(after.subscription.stripeProductId).toBe(
    before.subscription.stripeProductId,
  );
  expect(after.subscription.stripePriceId).not.toBe(
    before.subscription.stripePriceId,
  );
  expect(after.stripe.remoteSubscription.currentPriceId).not.toBe(
    before.stripe.remoteSubscription.currentPriceId,
  );
  expect(after.stripe.remoteSubscription.currentPriceId).toBe(
    after.subscription.stripePriceId,
  );

  const deltaIntents = modificationIntents(after).filter(
    (intent) => intent.status === "succeeded",
  );
  expect(deltaIntents).toHaveLength(1);
  expect(deltaIntents[0]).toMatchObject({
    amount: 200,
    amountReceived: 200,
    currency: "gbp",
    status: "succeeded",
    metadata: {
      subscriptionId: fixture.subscriptionId,
      subscriptionNumber: fixture.subscriptionNumber,
      type: "subscription_modification",
    },
  });
});

test("automatic resume charges a delivery whose prior invoice was fully refunded", async ({
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "resume-open",
    lifecycle: "resume",
    resumeRequiresPayment: true,
  });
  const before = await getState(request, fixture.subscriptionId);
  expect(fixture.resumeRequiredMinor).toBe(1_300);
  expect(fixture.resumeFundingRefundId).toMatch(/^re_/);
  expect(
    before.stripe.refunds.some(
      (refund) =>
        refund.id === fixture.resumeFundingRefundId &&
        refund.status === "succeeded" &&
        Number(refund.amount) === fixture.resumeRequiredMinor,
    ),
  ).toBe(true);

  const resumeResult = await autoResume(request, fixture.subscriptionId);
  expect.soft(resumeResult.ok, resumeResult.error).toBe(true);
  expect.soft(resumeResult.resumed).toBe(1);

  const after = await getState(request, fixture.subscriptionId);
  const previousIntentIds = new Set(
    before.stripe.paymentIntents.map((intent) => intent.id),
  );
  const resumeCharges = after.stripe.paymentIntents.filter(
    (intent) =>
      !previousIntentIds.has(intent.id) && intent.status === "succeeded",
  );
  expect.soft(
    resumeCharges.reduce(
      (total, intent) => total + Number(intent.amountReceived || 0),
      0,
    ),
  ).toBe(fixture.resumeRequiredMinor);
  expect.soft(after.subscription.status).toBe("active");
  expect.soft(after.stripe.remoteSubscription.pauseCollection).toBeNull();
});
