"use strict";

const { test, expect } = require("@playwright/test");
const {
  clearEmails,
  createFixture,
  getEmails,
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

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test.afterAll(async ({ request }) => {
  await reset(request);
});

test("subscription customer places a real one-time order with store credit and sees confirmation", async ({
  page,
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    funds: "sufficient",
    creditBalance: 10_000,
  });
  await clearEmails(request);

  await signIn(page, fixture.credentials, "/portal/orders");

  const placeOrder = page.getByRole("link", {
    name: "Place New Order",
    exact: true,
  });
  await expect(placeOrder).toHaveAttribute("href", "/shop");
  await placeOrder.click();
  await expect(page).toHaveURL(/\/shop(?:\?|$)/);

  const addToBasket = page.getByRole("button", {
    name: "Add to basket",
    exact: true,
  }).first();
  await expect(addToBasket).toBeVisible();
  await addToBasket.click();
  await expect(page.getByText(/added to your basket/i)).toBeVisible();

  await page.goto("/checkout");

  const creditOption = page.getByText("Apply store credit", { exact: true });
  await expect(creditOption).toBeVisible();
  await expect(
    page.getByText(/You have £100\.00 available\./i),
  ).toBeVisible();

  await creditOption.locator("xpath=ancestor::label[1]").click();

  await expect(page.getByText("Store credit", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Place Order - £0\.00/i }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /Place Order - £0\.00/i })
    .click();

  await expect(page).toHaveURL(/\/checkout\/success\?credit=1&order_id=/);
  await expect(
    page.getByRole("heading", { name: "Thank You for Your Order!" }),
  ).toBeVisible();
  await expect(page.getByText("Payment Confirmed", { exact: true })).toBeVisible();

  const viewOrder = page.getByRole("link", { name: "View Order", exact: true });
  await expect(viewOrder).toHaveAttribute("href", /\/portal\/orders\/[a-f\d]{24}/i);

  const outbox = await getEmails(request);
  const confirmations = outbox.emails.filter(
    (email) =>
      email.to === fixture.credentials.email &&
      email.template === "orderConfirmation",
  );
  expect(confirmations).toHaveLength(1);

  await viewOrder.click();
  await expect(page).toHaveURL(/\/portal\/orders\/[a-f\d]{24}$/i);
  await expect(page.getByText(/paid/i).first()).toBeVisible();

  await page.goto("/portal/orders");
  await expect(
    page.getByRole("link", { name: "Place New Order", exact: true }).first(),
  ).toHaveAttribute("href", "/shop");
  await expect(page.getByText(/paid/i).first()).toBeVisible();

  await page.goto("/portal/credit");
  await expect(page.getByText(/Used on order/i).first()).toBeVisible();
  await expect(page.getByText("£100.00", { exact: true })).toHaveCount(0);
});
