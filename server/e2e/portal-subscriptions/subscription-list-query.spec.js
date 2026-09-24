"use strict";

const { test, expect } = require("@playwright/test");
const {
  API_ORIGIN,
  createFixture,
  login,
  reset,
} = require("../support/e2e-client");

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test.afterAll(async ({ request }) => {
  await reset(request);
});

test("subscription list validates pagination before querying the portal service", async ({
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    funds: "sufficient",
  });
  const token = await login(request, fixture.credentials);

  const invalid = await request.get(
    `${API_ORIGIN}/api/portal/subscriptions?page=0&pageSize=20`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  expect(invalid.status()).toBe(400);
  const invalidBody = await invalid.json();
  expect(invalidBody.message).toMatch(/page/i);

  const valid = await request.get(
    `${API_ORIGIN}/api/portal/subscriptions?page=1&pageSize=1`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  expect(valid.ok()).toBe(true);
  const validBody = await valid.json();
  expect(validBody.data?.meta).toMatchObject({
    page: 1,
    pageSize: 1,
  });
  expect(validBody.data?.subscriptions).toHaveLength(1);
  expect(validBody.data?.subscriptions?.[0]?.upcomingDeliveryDate).toBeTruthy();
});
