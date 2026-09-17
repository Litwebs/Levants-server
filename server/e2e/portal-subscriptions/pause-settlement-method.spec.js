"use strict";

const { test, expect } = require("@playwright/test");
const {
  API_ORIGIN,
  createFixture,
  getState,
  reset,
} = require("../support/e2e-client");

async function signIn(page, credentials, redirectPath) {
  await page.goto(`/login?redirect=${encodeURIComponent(redirectPath)}`);
  await page.getByLabel("Email address").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);

  await Promise.all([
    page.waitForURL((url) => url.pathname === redirectPath),
    page.getByRole("button", { name: "Sign In", exact: true }).click(),
  ]);
}

function waitForPauseResponse(page, subscriptionId) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === API_ORIGIN &&
      url.pathname === `/api/portal/subscriptions/${subscriptionId}/pause` &&
      response.request().method() === "POST"
    );
  });
}

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test.afterAll(async ({ request }) => {
  await reset(request);
});

test("customer can choose store credit when pausing a prepaid subscription", async ({
  page,
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    funds: "sufficient",
  });
  const detailPath = `/portal/subscriptions/${fixture.subscriptionId}`;
  const before = await getState(request, fixture.subscriptionId);
  const creditBefore = Number(before.customer.creditBalance || 0);
  const ledgerCountBefore = before.credits.length;

  await signIn(page, fixture.credentials, detailPath);
  await page
    .getByRole("button", { name: "Pause Subscription", exact: true })
    .click();

  const pauseDialog = page.getByRole("dialog", {
    name: "Pause Subscription?",
  });
  await expect(pauseDialog).toBeVisible();

  const settlementMethod = pauseDialog.getByRole("combobox", {
    name: "Settlement method",
  });
  await expect(settlementMethod).toBeVisible();
  await expect(settlementMethod).toContainText("Refund to payment card");
  await settlementMethod.click();
  await page.getByRole("option", { name: "Store credit", exact: true }).click();
  await expect(settlementMethod).toContainText("Store credit");

  await pauseDialog.locator('input[type="date"]').fill(fixture.resumeOn);

  const pauseResponsePromise = waitForPauseResponse(
    page,
    fixture.subscriptionId,
  );
  await pauseDialog
    .getByRole("button", { name: "Pause subscription", exact: true })
    .click();

  const pauseResponse = await pauseResponsePromise;
  const pauseBody = await pauseResponse.json().catch(() => null);
  expect(
    pauseResponse.ok(),
    pauseBody?.message || JSON.stringify(pauseBody),
  ).toBe(true);
  expect(pauseBody?.success).toBe(true);
  expect(pauseBody?.data?.subscription?.status).toBe("paused");
  expect(Number(pauseBody?.data?.creditedMinor || 0)).toBeGreaterThan(0);
  expect(Number(pauseBody?.data?.refundedMinor || 0)).toBe(0);

  const requestPayload = pauseResponse.request().postDataJSON();
  expect(requestPayload).toMatchObject({
    resumeOn: fixture.resumeOn,
    refundMethod: "credit",
  });

  const after = await getState(request, fixture.subscriptionId);
  const creditedMinor = Number(pauseBody.data.creditedMinor);
  expect(after.subscription.status).toBe("paused");
  expect(Number(after.customer.creditBalance || 0)).toBe(
    creditBefore + creditedMinor,
  );
  expect(after.credits).toHaveLength(ledgerCountBefore + 1);
  expect(after.credits.at(-1)).toMatchObject({
    type: "subscription_refund",
    amountMinor: creditedMinor,
  });
});
