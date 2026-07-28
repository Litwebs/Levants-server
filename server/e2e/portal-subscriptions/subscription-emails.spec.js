"use strict";

const { test, expect } = require("@playwright/test");
const {
  API_ORIGIN,
  clearEmails,
  createFixture,
  getEmails,
  getState,
  login,
  portalHeaders,
  reset,
} = require("../support/e2e-client");

async function expectSuccess(response) {
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBe(true);
  return body;
}

function expectSubscriptionEmail(email, { to, title, subscriptionNumber }) {
  expect(email).toMatchObject({
    to,
    template: "subscriptionUpdate",
  });
  expect(email.templateParams).toMatchObject({ title, subscriptionNumber });
  expect(email.html).toContain(subscriptionNumber);
  expect(email.html).toContain(
    "https://res.cloudinary.com/deonzcviy/image/upload/v1777833005/logo_znwpja.png",
  );
  expect(email.html).toContain("background:#244233");
  expect(email.html).toContain("background:#d4a017");
  expect(email.html).toContain("background:#fdfaf6");
}

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test.afterAll(async ({ request }) => {
  await reset(request);
});

test("emails the customer after subscription creation, item update, pause, resume and cancellation", async ({
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    funds: "sufficient",
  });
  const token = await login(request, fixture.credentials);
  const headers = portalHeaders(token);

  let outbox = await getEmails(request);
  expect(outbox.emails).toHaveLength(1);
  expectSubscriptionEmail(outbox.emails[0], {
    to: fixture.credentials.email,
    title: "Subscription created",
    subscriptionNumber: fixture.subscriptionNumber,
  });

  await clearEmails(request);
  const state = await getState(request, fixture.subscriptionId);
  const milk = state.subscription.items.find(
    (item) => String(item.variant) === fixture.variants.MILK.id,
  );
  await expectSuccess(
    await request.patch(
      `${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}/items/${milk._id}`,
      { headers, data: { quantity: Number(milk.quantity) + 1 } },
    ),
  );
  outbox = await getEmails(request);
  expect(outbox.emails).toHaveLength(1);
  expectSubscriptionEmail(outbox.emails[0], {
    to: fixture.credentials.email,
    title: "Subscription items updated",
    subscriptionNumber: fixture.subscriptionNumber,
  });
  expect(outbox.emails[0].templateParams.message).toMatch(/charged/i);

  await clearEmails(request);
  const resumeOn = new Date();
  resumeOn.setDate(resumeOn.getDate() + 14);
  await expectSuccess(
    await request.post(
      `${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}/pause`,
      {
        headers,
        data: { resumeOn: resumeOn.toISOString(), refundMethod: "credit" },
      },
    ),
  );
  outbox = await getEmails(request);
  expect(outbox.emails).toHaveLength(1);
  expect(outbox.emails[0].templateParams.title).toBe("Subscription paused");

  await clearEmails(request);
  await expectSuccess(
    await request.post(
      `${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}/resume`,
      { headers },
    ),
  );
  outbox = await getEmails(request);
  expect(outbox.emails).toHaveLength(1);
  expect(outbox.emails[0].templateParams.title).toBe("Subscription resumed");

  await clearEmails(request);
  await expectSuccess(
    await request.post(
      `${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}/cancel`,
      {
        headers,
        data: { reason: "Email E2E", refundMethod: "credit" },
      },
    ),
  );
  outbox = await getEmails(request);
  expect(outbox.emails).toHaveLength(1);
  expect(outbox.emails[0].templateParams.title).toMatch(
    /Subscription cancel(?:led|lation scheduled)/,
  );
});

test("does not send subscription emails when the customer has opted out", async ({
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "after-cutoff",
    funds: "sufficient",
    subscriptionUpdates: false,
  });
  expect((await getEmails(request)).emails).toHaveLength(0);

  const token = await login(request, fixture.credentials);
  const headers = portalHeaders(token);
  const state = await getState(request, fixture.subscriptionId);
  const butter = state.subscription.items.find(
    (item) => String(item.variant) === fixture.variants.BUTTER.id,
  );
  const response = await request.delete(
    `${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}/items/${butter._id}`,
    { headers, data: { refundMethod: "credit" } },
  );
  const body = await expectSuccess(response);
  expect(body.data.appliedTo).toBe("next");
  expect((await getEmails(request)).emails).toHaveLength(0);
});
