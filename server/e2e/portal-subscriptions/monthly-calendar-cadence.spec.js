"use strict";

const { test, expect } = require("@playwright/test");
const {
  API_ORIGIN,
  createFixture,
  getState,
  login,
  portalHeaders,
  reset,
} = require("../support/e2e-client");

function localParts(value) {
  const date = new Date(value);
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
    weekday: date.getDay(),
  };
}

function nextCalendarMonth({ year, month }) {
  const date = new Date(year, month + 1, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function activeDeliveries(state) {
  return (state.deliveries || [])
    .filter((delivery) => ["scheduled", "generated"].includes(delivery.status))
    .sort(
      (left, right) =>
        new Date(left.scheduledDate).getTime() -
        new Date(right.scheduledDate).getTime(),
    );
}

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test.afterAll(async ({ request }) => {
  await reset(request);
});

test("monthly subscription schedules one selected-weekday delivery per calendar month and uses Stripe month billing", async ({
  request,
}) => {
  const fixture = await createFixture(request, {
    createSubscription: false,
    portalCreationDays: true,
  });
  const token = await login(request, fixture.credentials);
  const preferredDay = fixture.deliveryDays[0];

  const response = await request.post(
    `${API_ORIGIN}/api/portal/subscriptions`,
    {
      headers: portalHeaders(token),
      data: {
        frequency: "monthly",
        preferredDeliveryDay: preferredDay,
        preferredDeliveryDays: [preferredDay],
        deliveryAddressId: fixture.addressId,
        items: [
          { variantId: fixture.variants.MILK.id, quantity: 2 },
          { variantId: fixture.variants.BUTTER.id, quantity: 1 },
        ],
        notes: `Monthly calendar cadence E2E ${fixture.scenarioId}`,
      },
      timeout: 90_000,
    },
  );
  const body = await response.json().catch(() => null);

  expect(response.status(), body?.message || JSON.stringify(body)).toBe(201);
  expect(body?.success).toBe(true);
  const subscriptionId = body?.data?.subscription?._id;
  expect(subscriptionId).toBeTruthy();

  const state = await getState(request, subscriptionId);
  expect(state.subscription.frequency).toBe("monthly");
  expect(state.stripe.remoteSubscription).toMatchObject({
    interval: "month",
    intervalCount: 1,
  });

  const deliveries = activeDeliveries(state);
  expect(deliveries.length).toBeGreaterThanOrEqual(3);
  const firstThree = deliveries.slice(0, 3).map((delivery) =>
    localParts(delivery.scheduledDate),
  );

  for (const delivery of firstThree) {
    expect(delivery.weekday).toBe(preferredDay);
  }

  for (let index = 1; index < firstThree.length; index += 1) {
    const expectedMonth = nextCalendarMonth(firstThree[index - 1]);
    expect({
      year: firstThree[index].year,
      month: firstThree[index].month,
    }).toEqual(expectedMonth);
  }

  // Regression guard for the old +30-days implementation: a fixed 30-day jump
  // moves the weekday by two days and cannot satisfy the invariant above.
  const firstGapDays = Math.round(
    (new Date(deliveries[1].scheduledDate).getTime() -
      new Date(deliveries[0].scheduledDate).getTime()) /
      86_400_000,
  );
  expect([28, 35]).toContain(firstGapDays);
});
