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

const WEEKDAY_BY_SHORT_NAME = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function londonParts(value) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date(value));
  const part = (type) =>
    parts.find((candidate) => candidate.type === type)?.value;

  return {
    year: Number(part("year")),
    month: Number(part("month")),
    day: Number(part("day")),
    weekday: WEEKDAY_BY_SHORT_NAME[part("weekday")],
  };
}

function businessDayGap(left, right) {
  const leftParts = londonParts(left);
  const rightParts = londonParts(right);
  const leftUtc = Date.UTC(
    leftParts.year,
    leftParts.month - 1,
    leftParts.day,
  );
  const rightUtc = Date.UTC(
    rightParts.year,
    rightParts.month - 1,
    rightParts.day,
  );
  return Math.round((rightUtc - leftUtc) / 86_400_000);
}

function nextSelectedDistance(fromWeekday, selectedDays) {
  return Math.min(
    ...selectedDays.map((day) => {
      const distance = (Number(day) - Number(fromWeekday) + 7) % 7;
      return distance === 0 ? 7 : distance;
    }),
  );
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

test("weekly multi-day creation picks the nearest selected weekday and keeps stepping through selected days", async ({
  request,
}) => {
  // Keep both selected days safely outside the default two-day modification\n  // cut-off so this cadence test is not dependent on the weekday CI happens\n  // to run. Cut-off skipping is covered separately by the rules/cut-off tests.\n  const currentWeekday = londonParts(new Date()).weekday;\n  const selectedDays = [\n    (currentWeekday + 3) % 7,\n    (currentWeekday + 5) % 7,\n  ];
  const fixture = await createFixture(request, {
    createSubscription: false,
    deliveryDays: selectedDays,
  });
  const token = await login(request, fixture.credentials);

  const response = await request.post(
    `${API_ORIGIN}/api/portal/subscriptions`,
    {
      headers: portalHeaders(token),
      data: {
        frequency: "weekly",
        preferredDeliveryDay: selectedDays[0],
        preferredDeliveryDays: selectedDays,
        deliveryAddressId: fixture.addressId,
        deliveryDayPlans: selectedDays.map((day) => ({
          day,
          items: [
            { variantId: fixture.variants.MILK.id, quantity: 1 },
            { variantId: fixture.variants.BUTTER.id, quantity: 1 },
          ],
        })),
        notes: `Multi-day cadence E2E ${fixture.scenarioId}`,
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
  expect(state.subscription.frequency).toBe("weekly");
  expect(new Set(state.subscription.preferredDeliveryDays)).toEqual(
    new Set(selectedDays),
  );
  expect(state.stripe.remoteSubscription).toMatchObject({
    interval: "week",
    intervalCount: 1,
  });

  const deliveries = activeDeliveries(state);
  expect(deliveries.length).toBeGreaterThanOrEqual(3);

  const first = deliveries[0];
  const startParts = londonParts(state.subscription.startDate);
  const firstParts = londonParts(first.scheduledDate);
  expect(selectedDays).toContain(firstParts.weekday);
  expect(
    businessDayGap(state.subscription.startDate, first.scheduledDate),
  ).toBe(nextSelectedDistance(startParts.weekday, selectedDays));

  const inspected = deliveries.slice(0, Math.min(6, deliveries.length));
  for (let index = 0; index < inspected.length; index += 1) {
    const current = londonParts(inspected[index].scheduledDate);
    expect(selectedDays).toContain(current.weekday);

    if (index === 0) continue;
    const previous = londonParts(inspected[index - 1].scheduledDate);
    expect(
      businessDayGap(
        inspected[index - 1].scheduledDate,
        inspected[index].scheduledDate,
      ),
    ).toBe(nextSelectedDistance(previous.weekday, selectedDays));
  }

  // With Sunday + Wednesday selected, every generated step must alternate
  // through the nearest selected weekday rather than jumping a fixed 7 days.
  for (let index = 1; index < inspected.length; index += 1) {
    expect(londonParts(inspected[index].scheduledDate).weekday).not.toBe(
      londonParts(inspected[index - 1].scheduledDate).weekday,
    );
  }
});
