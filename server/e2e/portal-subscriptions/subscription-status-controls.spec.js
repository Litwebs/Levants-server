"use strict";
const crypto = require("crypto");
const { test, expect } = require("@playwright/test");
const { API_ORIGIN, createFixture, getState, login, reset } = require("../support/e2e-client");
const { retryTransientResponse } = require("../support/retry-transient-response");
async function signIn(page, credentials, path) {
  await page.goto("/login?redirect=" + encodeURIComponent(path));
  await page.getByLabel("Email address").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await Promise.all([page.waitForURL(url => url.pathname === path),
    page.getByRole("button", { name: "Sign In", exact: true }).click()]);
}
async function mutate(request, token, path, data) {
  const response = await retryTransientResponse(() => request.post(API_ORIGIN + path, {
    headers: { Authorization: "Bearer " + token },
    data: { ...data, operationId: data.operationId },
  }), async response => [409, 503].includes(response.status()) &&
    Boolean((await response.json()).data?.subscriptionBusy));
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBe(true);
  expect(body.success).toBe(true);
  return body;
}
test.beforeEach(async ({ request }) => { await reset(request); });
test.afterAll(async ({ request }) => { await reset(request); });
for (const state of ["paused", "cancelled", "scheduled"]) {
  test(state + " subscriptions block editing and direct product/add-on routes", async ({ page, request }) => {
    const fixture = await createFixture(request, state === "paused"
      ? { cadence: "weekly-single-day", timing: "resume-open", lifecycle: "resume", pauseStillActive: true, funds: "sufficient" }
      : { cadence: "weekly-single-day", timing: state === "scheduled" ? "after-cutoff" : "before-cutoff", funds: "sufficient" });
    const token = await login(request, fixture.credentials);
    const path = "/portal/subscriptions/" + fixture.subscriptionId;
    if (state !== "paused") await mutate(request, token, "/api" + path + "/cancel",
      { refundMethod: "refund", operationId: crypto.randomUUID() });
    const before = await getState(request, fixture.subscriptionId);
    expect(before.subscription.status).toBe(state === "scheduled" ? "active" : state);
    if (state === "scheduled") expect(before.subscription.isCancellationScheduled).toBe(true);
    await signIn(page, fixture.credentials, path);
    await expect(page.getByRole("button", { name: "Save product changes", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save delivery details", exact: true })).toBeDisabled();
    await expect(page.getByRole("link", { name: "Add product", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Add to next delivery", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Manage addresses", exact: true })).toBeDisabled();
    const details = page.getByRole("heading", { name: "Delivery Address", exact: true }).locator("xpath=ancestor::section[1]");
    await expect(details.getByRole("combobox")).toBeDisabled();
    if (state === "paused") {
      await expect(page.getByRole("button", { name: "Resume Subscription", exact: true })).toBeEnabled();
      await expect(page.getByRole("button", { name: "Cancel Subscription", exact: true })).toBeEnabled();
    }
    await page.goto(path + "/add-products");
    await expect(page.getByRole("status")).toContainText("Products cannot be changed");
    await expect(page.getByRole("button", { name: "Save selected products", exact: true })).toHaveCount(0);
    await page.goto(path + "/next-delivery/add-ons");
    await expect(page.getByText(/One-time add-ons are unavailable while this subscription/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Pay £.+ and add once/ })).toHaveCount(0);
    const after = await getState(request, fixture.subscriptionId);
    expect(after.subscription.status).toBe(before.subscription.status);
    expect(after.stripe.paymentIntents.map(p => p.id).sort()).toEqual(before.stripe.paymentIntents.map(p => p.id).sort());
    if (state === "cancelled") {
      const refunded = after.orders.filter(order => order.status === "refunded");
      expect(refunded.length).toBeGreaterThan(0);
      for (const order of refunded) {
        expect(order.deliveryStatus).toBe("cancelled");
        expect(order.portalDeliveryStatus).toBe("cancelled");
      }
      const order = refunded[0];
      const response = await request.get(API_ORIGIN + "/api/portal/orders/" + order._id,
        { headers: { Authorization: "Bearer " + token } });
      expect((await response.json()).data.order.deliveryStatus).toBe("cancelled");
      await page.goto("/portal/orders/" + order._id);
      await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Ordered", { exact: true })).toHaveCount(0);
    }
    if (state === "scheduled") {
      for (const order of after.orders.filter(order => order.status === "paid")) {
        expect(order.deliveryStatus).toBe("ordered");
      }
    }
  });
}
test("cancelling after a pause closes already refunded open deliveries without another refund", async ({ request }) => {
  const fixture = await createFixture(request, { cadence: "weekly-single-day", timing: "before-cutoff", funds: "sufficient" });
  const token = await login(request, fixture.credentials);
  const path = "/api/portal/subscriptions/" + fixture.subscriptionId;
  await mutate(request, token, path + "/pause", { resumeOn: fixture.resumeOn, refundMethod: "refund", operationId: crypto.randomUUID() });
  const paused = await getState(request, fixture.subscriptionId);
  expect(paused.orders.some(o => o.status === "refunded")).toBe(true);
  await mutate(request, token, path + "/cancel", { refundMethod: "refund", operationId: crypto.randomUUID() });
  const cancelled = await getState(request, fixture.subscriptionId);
  expect(cancelled.subscription.status).toBe("cancelled");
  expect(cancelled.stripe.refunds.map(r => r.id).sort()).toEqual(paused.stripe.refunds.map(r => r.id).sort());
  for (const order of cancelled.orders.filter(o => o.status === "refunded")) {
    expect(order.deliveryStatus).toBe("cancelled");
  }
});
