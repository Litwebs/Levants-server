"use strict";

const crypto = require("crypto");
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

function deliveryAddOnIntents(state) {
  return state.stripe.paymentIntents.filter(
    (intent) =>
      intent.metadata?.type === "delivery_add_on" &&
      id(intent.metadata?.subscriptionId) === id(state.subscription._id),
  );
}

function deliveryAddOnSnapshot(deliveries) {
  return (deliveries || []).map((delivery) => ({
    id: id(delivery._id),
    order: id(delivery.order),
    status: delivery.status,
    addOns: (delivery.addOns || []).map((addOn) => ({
      operationId: addOn.operationId,
      amountMinor: Number(addOn.amountMinor),
      stripePaymentIntentId: addOn.stripePaymentIntentId,
      items: itemSnapshot(addOn.items),
    })),
  }));
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

test("one-time add-on charges once and changes only the upcoming delivery", async ({
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    funds: "sufficient",
  });
  const token = await login(request, fixture.credentials);
  const before = await getState(request, fixture.subscriptionId);
  const recurringBefore = subscriptionMutationSnapshot(before.subscription);
  const remotePriceBefore = before.stripe.remoteSubscription.currentPriceId;
  const upcomingBefore = before.deliveries[0];
  const upcomingOrderBefore = before.orders.find(
    (order) => id(order._id) === id(upcomingBefore.order),
  );
  const operationId = crypto.randomUUID();
  const quantityToAdd = 2;
  const expectedChargeMinor = Math.round(
    Number(fixture.variants.EGGS.price) * quantityToAdd * 100,
  );
  const endpoint = `${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}/next-delivery/add-ons`;
  const payload = {
    operationId,
    items: [
      { variantId: fixture.variants.EGGS.id, quantity: quantityToAdd },
    ],
  };

  const response = await request.post(endpoint, {
    headers: portalHeaders(token),
    data: payload,
    timeout: 60_000,
  });
  const body = await expectSuccessfulResponse(response);
  expect(body.data.chargedMinor).toBe(expectedChargeMinor);

  const retryResponse = await request.post(endpoint, {
    headers: portalHeaders(token),
    data: payload,
    timeout: 60_000,
  });
  const retryBody = await expectSuccessfulResponse(retryResponse);
  expect(retryBody.message).toMatch(/already paid/i);

  const after = await getState(request, fixture.subscriptionId);
  expect(subscriptionMutationSnapshot(after.subscription)).toEqual(
    recurringBefore,
  );
  expect(after.stripe.remoteSubscription.currentPriceId).toBe(
    remotePriceBefore,
  );

  const deliveryWithAddOn = after.deliveries.find(
    (delivery) => id(delivery._id) === id(upcomingBefore._id),
  );
  expect(deliveryWithAddOn.addOns).toHaveLength(1);
  expect(deliveryWithAddOn.addOns[0]).toMatchObject({
    operationId,
    amountMinor: expectedChargeMinor,
    items: [
      expect.objectContaining({
        variant: fixture.variants.EGGS.id,
        quantity: quantityToAdd,
      }),
    ],
  });
  expect(
    after.deliveries
      .filter((delivery) => id(delivery._id) !== id(upcomingBefore._id))
      .every((delivery) => (delivery.addOns || []).length === 0),
  ).toBe(true);

  const updatedOrder = after.orders.find(
    (order) => id(order._id) === id(upcomingBefore.order),
  );
  expect(
    updatedOrder.items.filter((item) => item.isSubscriptionAddOn),
  ).toEqual([
    expect.objectContaining({
      variant: fixture.variants.EGGS.id,
      quantity: quantityToAdd,
    }),
  ]);
  expect(Number(updatedOrder.total)).toBe(
    Number(upcomingOrderBefore.total) + expectedChargeMinor / 100,
  );
  expect(
    updatedOrder.paymentAllocations.filter(
      (allocation) => allocation.source === "delivery_add_on",
    ),
  ).toEqual([
    expect.objectContaining({
      amountMinor: expectedChargeMinor,
      idempotencyKey: `delivery-add-on:${operationId}`,
    }),
  ]);

  const addOnIntents = after.stripe.paymentIntents.filter(
    (intent) =>
      intent.metadata?.type === "delivery_add_on" &&
      intent.metadata?.operationId === operationId,
  );
  expect(addOnIntents).toEqual([
    expect.objectContaining({
      amount: expectedChargeMinor,
      amountReceived: expectedChargeMinor,
      currency: "gbp",
      status: "succeeded",
    }),
  ]);
});

test("separate add-on purchases accumulate on one delivery and charge each operation exactly once", async ({
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    funds: "sufficient",
  });
  const token = await login(request, fixture.credentials);
  const before = await getState(request, fixture.subscriptionId);
  const recurringBefore = subscriptionMutationSnapshot(before.subscription);
  const remotePriceBefore = before.stripe.remoteSubscription.currentPriceId;
  const nextDeliveryBefore = before.deliveries[0];
  const orderBefore = before.orders.find(
    (order) => id(order._id) === id(nextDeliveryBefore.order),
  );
  const firstOperationId = crypto.randomUUID();
  const secondOperationId = crypto.randomUUID();
  const firstChargeMinor = Math.round(
    Number(fixture.variants.EGGS.price) * 100,
  );
  const secondChargeMinor = Math.round(
    (Number(fixture.variants.EGGS.price) * 2 +
      Number(fixture.variants.MILK.price)) *
      100,
  );
  const endpoint = `${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}/next-delivery/add-ons`;

  const first = await request.post(endpoint, {
    headers: portalHeaders(token),
    data: {
      operationId: firstOperationId,
      items: [{ variantId: fixture.variants.EGGS.id, quantity: 1 }],
    },
    timeout: 60_000,
  });
  expect((await expectSuccessfulResponse(first)).data.chargedMinor).toBe(
    firstChargeMinor,
  );

  const secondPayload = {
    operationId: secondOperationId,
    items: [
      { variantId: fixture.variants.EGGS.id, quantity: 2 },
      { variantId: fixture.variants.MILK.id, quantity: 1 },
    ],
  };
  const second = await request.post(endpoint, {
    headers: portalHeaders(token),
    data: secondPayload,
    timeout: 60_000,
  });
  expect((await expectSuccessfulResponse(second)).data.chargedMinor).toBe(
    secondChargeMinor,
  );
  const secondRetry = await request.post(endpoint, {
    headers: portalHeaders(token),
    data: secondPayload,
    timeout: 60_000,
  });
  expect((await expectSuccessfulResponse(secondRetry)).message).toMatch(
    /already paid/i,
  );

  const after = await getState(request, fixture.subscriptionId);
  expect(subscriptionMutationSnapshot(after.subscription)).toEqual(
    recurringBefore,
  );
  expect(after.stripe.remoteSubscription.currentPriceId).toBe(
    remotePriceBefore,
  );
  expect(after.deliveries[0].addOns).toHaveLength(2);
  expect(
    after.deliveries
      .slice(1)
      .every((delivery) => (delivery.addOns || []).length === 0),
  ).toBe(true);

  const updatedOrder = after.orders.find(
    (order) => id(order._id) === id(nextDeliveryBefore.order),
  );
  expect(Number(updatedOrder.total)).toBe(
    Number(orderBefore.total) + (firstChargeMinor + secondChargeMinor) / 100,
  );
  expect(
    updatedOrder.items.filter((item) => item.isSubscriptionAddOn),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        variant: fixture.variants.EGGS.id,
        quantity: 1,
      }),
      expect.objectContaining({
        variant: fixture.variants.EGGS.id,
        quantity: 2,
      }),
      expect.objectContaining({
        variant: fixture.variants.MILK.id,
        quantity: 1,
      }),
    ]),
  );
  expect(
    updatedOrder.paymentAllocations.filter(
      (allocation) => allocation.source === "delivery_add_on",
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        amountMinor: firstChargeMinor,
        idempotencyKey: `delivery-add-on:${firstOperationId}`,
      }),
      expect.objectContaining({
        amountMinor: secondChargeMinor,
        idempotencyKey: `delivery-add-on:${secondOperationId}`,
      }),
    ]),
  );
  expect(
    deliveryAddOnIntents(after)
      .filter((intent) => intent.status === "succeeded")
      .map((intent) => ({
        operationId: intent.metadata.operationId,
        amount: Number(intent.amount),
      })),
  ).toEqual(
    expect.arrayContaining([
      { operationId: firstOperationId, amount: firstChargeMinor },
      { operationId: secondOperationId, amount: secondChargeMinor },
    ]),
  );
});

test("declined add-on payment is atomic across delivery, order, recurring subscription, and Stripe", async ({
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
    `${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}/next-delivery/add-ons`,
    {
      headers: portalHeaders(token),
      data: {
        operationId: crypto.randomUUID(),
        items: [{ variantId: fixture.variants.EGGS.id, quantity: 2 }],
      },
      timeout: 60_000,
    },
  );
  const body = await responseBody(response);
  expect(response.status()).toBe(400);
  expect(body.success).toBe(false);
  expect(body.message || "").toMatch(/declin|fund|charge|payment/i);

  const after = await getState(request, fixture.subscriptionId);
  expect(subscriptionMutationSnapshot(after.subscription)).toEqual(
    subscriptionMutationSnapshot(before.subscription),
  );
  expect(deliveryAddOnSnapshot(after.deliveries)).toEqual(
    deliveryAddOnSnapshot(before.deliveries),
  );
  expect(orderSnapshot(after.orders)).toEqual(orderSnapshot(before.orders));
  expect(after.stripe.remoteSubscription).toMatchObject(
    before.stripe.remoteSubscription,
  );
  expect(successfulPaymentSnapshot(after)).toEqual(
    successfulPaymentSnapshot(before),
  );
  expect(
    deliveryAddOnIntents(after).filter(
      (intent) => intent.status === "succeeded",
    ),
  ).toHaveLength(0);
});

test("cut-off, paused-state, ownership, and payload guards reject add-ons without charging", async ({
  request,
}) => {
  const cutOffFixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "after-cutoff",
    funds: "sufficient",
  });
  const cutOffToken = await login(request, cutOffFixture.credentials);
  const cutOffBefore = await getState(request, cutOffFixture.subscriptionId);
  const cutOffResponse = await request.post(
    `${API_ORIGIN}/api/portal/subscriptions/${cutOffFixture.subscriptionId}/next-delivery/add-ons`,
    {
      headers: portalHeaders(cutOffToken),
      data: {
        operationId: crypto.randomUUID(),
        items: [{ variantId: cutOffFixture.variants.EGGS.id, quantity: 1 }],
      },
      timeout: 60_000,
    },
  );
  expect(cutOffResponse.status()).toBe(400);
  expect((await responseBody(cutOffResponse)).message).toMatch(/cut-off/i);
  const cutOffAfter = await getState(request, cutOffFixture.subscriptionId);
  expect(deliveryAddOnSnapshot(cutOffAfter.deliveries)).toEqual(
    deliveryAddOnSnapshot(cutOffBefore.deliveries),
  );
  expect(deliveryAddOnIntents(cutOffAfter)).toHaveLength(0);

  const pausedFixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "resume-open",
    lifecycle: "resume",
    pauseStillActive: true,
    funds: "sufficient",
  });
  const pausedToken = await login(request, pausedFixture.credentials);
  const pausedResponse = await request.post(
    `${API_ORIGIN}/api/portal/subscriptions/${pausedFixture.subscriptionId}/next-delivery/add-ons`,
    {
      headers: portalHeaders(pausedToken),
      data: {
        operationId: crypto.randomUUID(),
        items: [{ variantId: pausedFixture.variants.EGGS.id, quantity: 1 }],
      },
      timeout: 60_000,
    },
  );
  expect(pausedResponse.status()).toBe(400);
  expect((await responseBody(pausedResponse)).message).toMatch(/active/i);

  const crossCustomerResponse = await request.post(
    `${API_ORIGIN}/api/portal/subscriptions/${cutOffFixture.subscriptionId}/next-delivery/add-ons`,
    {
      headers: portalHeaders(pausedToken),
      data: {
        operationId: crypto.randomUUID(),
        items: [{ variantId: cutOffFixture.variants.EGGS.id, quantity: 1 }],
      },
    },
  );
  expect(crossCustomerResponse.status()).toBe(400);
  expect((await responseBody(crossCustomerResponse)).message).toMatch(
    /not found/i,
  );

  const invalidResponse = await request.post(
    `${API_ORIGIN}/api/portal/subscriptions/${pausedFixture.subscriptionId}/next-delivery/add-ons`,
    {
      headers: portalHeaders(pausedToken),
      data: {
        operationId: "not-a-uuid",
        items: [{ variantId: pausedFixture.variants.EGGS.id, quantity: 0 }],
      },
    },
  );
  expect(invalidResponse.status()).toBe(400);

  const pausedAfter = await getState(request, pausedFixture.subscriptionId);
  expect(
    pausedAfter.deliveries.every(
      (delivery) => (delivery.addOns || []).length === 0,
    ),
  ).toBe(true);
  expect(deliveryAddOnIntents(pausedAfter)).toHaveLength(0);
});

test("inventory, upcoming-delivery, and saved-card guards reject add-ons before charging", async ({
  request,
}) => {
  const unavailableFixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    funds: "sufficient",
    addOnStock: 0,
  });
  const unavailableToken = await login(
    request,
    unavailableFixture.credentials,
  );
  const unavailableResponse = await request.post(
    `${API_ORIGIN}/api/portal/subscriptions/${unavailableFixture.subscriptionId}/next-delivery/add-ons`,
    {
      headers: portalHeaders(unavailableToken),
      data: {
        operationId: crypto.randomUUID(),
        items: [
          { variantId: unavailableFixture.variants.EGGS.id, quantity: 1 },
        ],
      },
      timeout: 60_000,
    },
  );
  expect(unavailableResponse.status()).toBe(400);
  expect((await responseBody(unavailableResponse)).message).toMatch(
    /only 0 .* available/i,
  );
  const unavailableAfter = await getState(
    request,
    unavailableFixture.subscriptionId,
  );
  expect(
    unavailableAfter.deliveries.every(
      (delivery) => (delivery.addOns || []).length === 0,
    ),
  ).toBe(true);
  expect(deliveryAddOnIntents(unavailableAfter)).toHaveLength(0);

  const noDeliveryFixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    funds: "sufficient",
    withoutUpcomingDeliveries: true,
  });
  const noDeliveryToken = await login(request, noDeliveryFixture.credentials);
  const noDeliveryResponse = await request.post(
    `${API_ORIGIN}/api/portal/subscriptions/${noDeliveryFixture.subscriptionId}/next-delivery/add-ons`,
    {
      headers: portalHeaders(noDeliveryToken),
      data: {
        operationId: crypto.randomUUID(),
        items: [
          { variantId: noDeliveryFixture.variants.EGGS.id, quantity: 1 },
        ],
      },
      timeout: 60_000,
    },
  );
  expect(noDeliveryResponse.status()).toBe(400);
  expect((await responseBody(noDeliveryResponse)).message).toMatch(
    /no upcoming delivery/i,
  );
  const noDeliveryAfter = await getState(
    request,
    noDeliveryFixture.subscriptionId,
  );
  expect(noDeliveryAfter.deliveries).toHaveLength(0);
  expect(deliveryAddOnIntents(noDeliveryAfter)).toHaveLength(0);

  const noCardFixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    funds: "sufficient",
    withoutDefaultPaymentMethod: true,
  });
  const noCardToken = await login(request, noCardFixture.credentials);
  const noCardResponse = await request.post(
    `${API_ORIGIN}/api/portal/subscriptions/${noCardFixture.subscriptionId}/next-delivery/add-ons`,
    {
      headers: portalHeaders(noCardToken),
      data: {
        operationId: crypto.randomUUID(),
        items: [{ variantId: noCardFixture.variants.EGGS.id, quantity: 1 }],
      },
      timeout: 60_000,
    },
  );
  expect(noCardResponse.status()).toBe(400);
  expect((await responseBody(noCardResponse)).message).toMatch(
    /default card|payment method/i,
  );
  const noCardAfter = await getState(request, noCardFixture.subscriptionId);
  expect(
    noCardAfter.deliveries.every(
      (delivery) => (delivery.addOns || []).length === 0,
    ),
  ).toBe(true);
  expect(deliveryAddOnIntents(noCardAfter)).toHaveLength(0);
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
    amount: 1_400,
    amountReceived: 1_400,
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
  expect(Number(funded.orders[0].amountPaid)).toBe(16);

  const cancelResponse = await request.post(`${base}/cancel`, {
    headers,
    data: {
      reason: "E2E combined-payment cancellation refund",
      refundMethod: "refund",
    },
    timeout: 60_000,
  });
  const cancelBody = await expectSuccessfulResponse(cancelResponse);
  expect(cancelBody.data.refundedMinor).toBe(1_600);

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
      [fixture.initialPaymentIntentId, 1_400],
      [deltaIntents[0].id, 200],
    ]),
  );
  expect(
    cancellationRefunds.reduce(
      (total, refund) => total + Number(refund.amount),
      0,
    ),
  ).toBe(1_600);
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
  expect(fixture.resumeRequiredMinor).toBe(1_400);
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
