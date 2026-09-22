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

function itemByName(state, pattern) {
  return state.subscription.items.find((item) => pattern.test(item.name || ""));
}

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test.afterAll(async ({ request }) => {
  await reset(request);
});

test("single-day product edits use one replacement request and one settlement", async ({
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
  const milk = itemByName(before, /Whole Milk/i);
  const butter = itemByName(before, /Cultured Butter/i);
  expect(milk).toBeTruthy();
  expect(butter).toBeTruthy();

  const itemMutations = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (
      url.origin === API_ORIGIN &&
      url.pathname.startsWith(
        `/api/portal/subscriptions/${fixture.subscriptionId}/items`,
      ) &&
      ["PUT", "PATCH", "DELETE"].includes(req.method())
    ) {
      itemMutations.push({ method: req.method(), path: url.pathname });
    }
  });

  await signIn(page, fixture.credentials, detailPath);

  await page
    .getByRole("button", { name: /Decrease .*Whole Milk.* quantity/i })
    .click();
  await page
    .getByRole("button", { name: /Remove .*Cultured Butter/i })
    .click();

  const removeDialog = page.getByRole("dialog", { name: "Remove Product?" });
  await expect(removeDialog).toBeVisible();
  await removeDialog.getByRole("button", { name: "Remove", exact: true }).click();

  await page
    .getByRole("button", { name: "Save product changes", exact: true })
    .click();

  const refundDialog = page.getByRole("dialog", {
    name: "How would you like your refund?",
  });
  await expect(refundDialog).toBeVisible();

  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === API_ORIGIN &&
      url.pathname ===
        `/api/portal/subscriptions/${fixture.subscriptionId}/items` &&
      response.request().method() === "PUT"
    );
  });
  await refundDialog.getByRole("button", { name: /Store credit/i }).click();

  const response = await responsePromise;
  const body = await response.json().catch(() => null);
  expect(response.ok(), body?.message || JSON.stringify(body)).toBe(true);

  const requestBody = response.request().postDataJSON();
  expect(requestBody).toMatchObject({
    items: [{ itemId: String(milk._id), quantity: 1 }],
    refundMethod: "credit",
    expectedVersion: Number(before.subscription.customerVersion || 0),
  });
  expect(requestBody.operationId).toEqual(expect.any(String));

  await expect
    .poll(() => itemMutations.map((entry) => entry.method))
    .toEqual(["PUT"]);

  const after = await getState(request, fixture.subscriptionId);
  expect(after.subscription.items).toHaveLength(1);
  expect(String(after.subscription.items[0]._id)).toBe(String(milk._id));
  expect(after.subscription.items[0].quantity).toBe(1);

  expect(after.credits).toHaveLength(before.credits.length + 1);
  expect(Number(after.credits.at(-1)?.amount || 0)).toBe(800);
  expect(Number(after.customer.creditBalance || 0)).toBe(
    Number(before.customer.creditBalance || 0) + 800,
  );
});
