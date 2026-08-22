"use strict";

const { test, expect } = require("@playwright/test");
const {
  API_ORIGIN,
  createFixture,
  getState,
  reset,
} = require("../support/e2e-client");

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function id(value) {
  if (value && typeof value === "object") {
    return String(value._id || value.id || value);
  }
  return String(value || "");
}

function dayKey(value) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type) =>
    parts.find((candidate) => candidate.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function itemQuantity(items, variantId) {
  const item = (items || []).find(
    (candidate) => id(candidate.variant) === id(variantId),
  );
  return Number(item?.quantity || 0);
}

function subscriptionItem(state, variantId) {
  return state.subscription.items.find(
    (item) => id(item.variant) === id(variantId),
  );
}

function orderForDate(state, date) {
  return state.orders.find(
    (order) => dayKey(order.deliveryDate) === dayKey(date),
  );
}

function orderSnapshot(order) {
  return {
    id: id(order?._id),
    deliveryDate: dayKey(order?.deliveryDate),
    status: order?.status,
    deliveryStatus: order?.deliveryStatus,
    subtotal: Number(order?.subtotal),
    total: Number(order?.total),
    amountPaid: Number(order?.amountPaid),
    items: (order?.items || []).map((item) => ({
      variant: id(item.variant),
      name: item.name,
      sku: item.sku,
      price: Number(item.price),
      quantity: Number(item.quantity),
      subtotal: Number(item.subtotal),
    })),
  };
}

function modificationIntents(state) {
  return state.stripe.paymentIntents.filter(
    (intent) =>
      intent.metadata?.type === "subscription_modification" &&
      id(intent.metadata?.subscriptionId) === id(state.subscription._id),
  );
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function waitForApiResponse(page, method, pathname) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === API_ORIGIN &&
      url.pathname === pathname &&
      response.request().method() === method
    );
  });
}

async function expectApiSuccess(response) {
  const body = await response.json().catch(() => null);
  expect(response.ok(), body?.message || JSON.stringify(body)).toBe(true);
  expect(body?.success, JSON.stringify(body)).toBe(true);
  return body;
}

async function signIn(page, credentials, redirectPath) {
  await page.goto(`/login?redirect=${encodeURIComponent(redirectPath)}`);
  await page.getByLabel("Email address").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);

  await Promise.all([
    page.waitForURL((url) => url.pathname === redirectPath),
    page.getByRole("button", { name: "Sign In", exact: true }).click(),
  ]);
}

function productsSection(page) {
  return page
    .getByRole("heading", {
      name: "Products in Subscription",
      exact: true,
    })
    .locator("xpath=ancestor::section[1]");
}

function subscriptionItemCard(section, itemName) {
  return section
    .getByText(itemName, { exact: true })
    .first()
    .locator(
      "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' space-y-3 ')][1]",
    );
}

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test.afterAll(async ({ request }) => {
  await reset(request);
});

test("creates a weekly subscription with a saved real Stripe test card", async ({
  page,
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    createSubscription: false,
  });

  await signIn(page, fixture.credentials, "/portal/subscriptions/new");
  await expect(
    page.getByRole("heading", { name: "New Subscription", exact: true }),
  ).toBeVisible();

  const deliveryDay = DAY_NAMES[fixture.deliveryDays[0]];
  await page.getByRole("button", { name: new RegExp(`^${deliveryDay}`) }).click();

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "How often would you like delivery?",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Weekly\s+Every week/ }).click();

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Choose products for each delivery day",
      exact: true,
    }),
  ).toBeVisible();

  const productHeading = page.getByRole("heading", {
    name: new RegExp(`^${escapeRegex(fixture.variants.MILK.name)} - `),
  });
  const productCard = productHeading.locator(
    "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' card-product ')][1]",
  );
  await productCard
    .getByRole("button", { name: "Increase quantity", exact: true })
    .click();
  await productCard
    .getByRole("button", { name: `Add to ${deliveryDay}`, exact: true })
    .click();
  await expect(
    productCard.getByRole("button", {
      name: `Remove from ${deliveryDay}`,
      exact: true,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Delivery details", exact: true }),
  ).toBeVisible();
  const addressButton = page.getByRole("button", {
    name: /Stripe E2E\s+1 Subscription Test Lane, London, SW1A 1AA/,
  });
  await addressButton.click();

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review & Payment", exact: true }),
  ).toBeVisible();
  const savedCard = page.getByRole("button", {
    name: /Visa.*4242.*Default/i,
  });
  await expect(savedCard).toBeVisible();
  await savedCard.click();

  const createResponsePromise = waitForApiResponse(
    page,
    "POST",
    "/api/portal/subscriptions",
  );
  await page
    .getByRole("button", { name: "Create Subscription", exact: true })
    .click();
  const createBody = await expectApiSuccess(await createResponsePromise);
  const created = createBody.data?.subscription;
  expect(created?._id).toBeTruthy();
  expect(created?.subscriptionNumber).toBeTruthy();
  expect(created?.frequency).toBe("weekly");

  await expect(page).toHaveURL(/\/portal\/subscriptions$/);
  await expect(
    page.getByRole("heading", { name: "My Subscriptions", exact: true }),
  ).toBeVisible();
  const listCard = page
    .getByText(created.subscriptionNumber, { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'border-l-4')][1]");
  await expect(listCard.getByText("Active", { exact: true })).toBeVisible();
  await expect(listCard).toContainText("Weekly");
  await expect(listCard.getByRole("link", { name: /Manage/ })).toHaveAttribute(
    "href",
    `/portal/subscriptions/${created._id}`,
  );

  const state = await getState(request, created._id);
  expect(state.subscription.frequency).toBe("weekly");
  expect(state.subscription.preferredDeliveryDays).toEqual([
    fixture.deliveryDays[0],
  ]);
  expect(itemQuantity(state.subscription.items, fixture.variants.MILK.id)).toBe(
    2,
  );
  expect(state.stripe.remoteSubscription.id).toBe(
    state.subscription.stripeSubscriptionId,
  );
  expect(state.stripe.remoteSubscription.status).toBe("active");
  expect(state.stripe.remoteSubscription.currentPriceId).toBe(
    state.subscription.stripePriceId,
  );
  expect(state.stripe.remoteSubscription.interval).toBe("week");
  expect(state.stripe.remoteSubscription.intervalCount).toBe(1);
  expect(
    state.stripe.paymentIntents.some(
      (intent) =>
        intent.status === "succeeded" && Number(intent.amount) === 1100,
    ),
  ).toBe(true);
});

test("renders prepared multi-day subscriptions with the correct per-day product split", async ({
  page,
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-multi-day",
    timing: "before-cutoff",
    createSubscription: false,
    preparedDraft: "split-multi-day",
  });

  await signIn(page, fixture.credentials, "/portal/subscriptions");
  await page.addInitScript(
    ({ key, draft }) => {
      window.sessionStorage.setItem(key, JSON.stringify(draft));
    },
    {
      key: "levants_subscription_draft",
      draft: fixture.preparedDraft,
    },
  );
  await page.goto("/portal/subscriptions/new?prepared=1");

  await expect(
    page.getByRole("heading", { name: "Review & Payment", exact: true }),
  ).toBeVisible();
  const firstDayName = DAY_NAMES[fixture.deliveryDays[0]];
  const secondDayName = DAY_NAMES[fixture.deliveryDays[1]];

  const productsSection = page
    .getByRole("heading", { name: "Products", exact: true })
    .locator("xpath=ancestor::section[1]");
  const firstDayCard = productsSection
    .getByText(firstDayName, { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]");
  const secondDayCard = productsSection
    .getByText(secondDayName, { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]");

  await expect(firstDayCard).toContainText("2 products");
  await expect(firstDayCard).toContainText("3 qty");
  await expect(firstDayCard).toContainText("2 x £3.00");
  await expect(firstDayCard).toContainText("1 x £5.00");
  await expect(firstDayCard).not.toContainText("1 x £2.00");

  await expect(secondDayCard).toContainText("1 product");
  await expect(secondDayCard).toContainText("1 qty");
  await expect(secondDayCard).toContainText("1 x £2.00");
  await expect(secondDayCard).not.toContainText("2 x £3.00");
  await expect(secondDayCard).not.toContainText("1 x £5.00");
});

test("increases quantity before cut-off and updates Mongo, the paid order, and Stripe", async ({
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
  const milk = subscriptionItem(before, fixture.variants.MILK.id);

  await signIn(page, fixture.credentials, detailPath);
  await expect(
    page.getByRole("heading", {
      name: fixture.subscriptionNumber,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/You can edit this subscription until/i),
  ).toBeVisible();

  const section = productsSection(page);
  const itemCard = subscriptionItemCard(section, milk.name);
  await expect(itemCard.getByText("2", { exact: true })).toBeVisible();

  // These quantity controls are icon-only in the application, so scope the
  // selector to the named product card and select its plus icon.
  await itemCard.locator("button:has(svg.lucide-plus)").click();
  await expect(itemCard.getByText("3", { exact: true })).toBeVisible();
  await expect(section).toContainText("charged to your card now");

  const updateResponsePromise = waitForApiResponse(
    page,
    "PATCH",
    `/api/portal/subscriptions/${fixture.subscriptionId}/items/${fixture.variants.MILK.itemId}`,
  );
  await page
    .getByRole("button", { name: "Save product changes", exact: true })
    .click();
  const updateBody = await expectApiSuccess(await updateResponsePromise);
  expect(updateBody.data?.appliedTo).toBe("upcoming");
  expect(updateBody.data?.chargedMinor).toBe(
    fixture.expectedDeltaMinor["increase-existing-item-quantity"],
  );
  await expect(
    page
      .getByRole("main")
      .getByText(
        /You've been charged .* for the added items on your upcoming delivery, and future invoices have been updated\./i,
      ),
  ).toBeVisible();

  const after = await getState(request, fixture.subscriptionId);
  expect(itemQuantity(after.subscription.items, fixture.variants.MILK.id)).toBe(
    3,
  );
  expect(after.subscription.pendingChanges).toBeNull();
  expect(itemQuantity(after.orders[0]?.items, fixture.variants.MILK.id)).toBe(
    3,
  );
  expect(after.orders[0]?.amountPaid).toBe(before.orders[0]?.amountPaid + 5);

  expect(after.stripe.remoteSubscription.currentPriceId).not.toBe(
    before.stripe.remoteSubscription.currentPriceId,
  );
  expect(after.stripe.remoteSubscription.currentPriceId).toBe(
    after.subscription.stripePriceId,
  );
  const charge = modificationIntents(after).find(
    (intent) =>
      intent.status === "succeeded" &&
      Number(intent.amount) ===
        fixture.expectedDeltaMinor["increase-existing-item-quantity"],
  );
  expect(charge).toBeTruthy();
  expect(Number(charge.amountReceived)).toBe(
    fixture.expectedDeltaMinor["increase-existing-item-quantity"],
  );
});

test("stages an after-cutoff removal while preserving the locked delivery order", async ({
  page,
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "after-cutoff",
    funds: "sufficient",
  });
  const detailPath = `/portal/subscriptions/${fixture.subscriptionId}`;
  const before = await getState(request, fixture.subscriptionId);
  const butter = subscriptionItem(before, fixture.variants.BUTTER.id);
  const lockedBefore = orderForDate(before, fixture.lockedDeliveryDate);
  expect(lockedBefore).toBeTruthy();

  await signIn(page, fixture.credentials, detailPath);
  await expect(
    page.getByRole("heading", {
      name: fixture.subscriptionNumber,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /The cut-off for your next delivery.*has passed\. You can still make changes, but they'll apply from the delivery after that\./i,
    ),
  ).toBeVisible();

  const section = productsSection(page);
  await section
    .getByRole("button", { name: `Remove ${butter.name}`, exact: true })
    .click();
  const removeDialog = page.getByRole("dialog", { name: "Remove Product?" });
  await expect(removeDialog).toContainText(
    "Click Save product changes to apply it.",
  );
  await removeDialog
    .getByRole("button", { name: "Remove", exact: true })
    .click();

  await expect(section).toContainText(
    "has passed, so this change applies from the delivery after that",
  );
  await expect(section).toContainText("You won't be charged now");

  const removeResponsePromise = waitForApiResponse(
    page,
    "DELETE",
    `/api/portal/subscriptions/${fixture.subscriptionId}/items/${fixture.variants.BUTTER.itemId}`,
  );
  await page
    .getByRole("button", { name: "Save product changes", exact: true })
    .click();
  const removeBody = await expectApiSuccess(await removeResponsePromise);
  expect(removeBody.data?.appliedTo).toBe("next");
  expect(removeBody.message).toMatch(
    /Cut-off has passed for your next delivery\. This change will apply from/i,
  );

  await expect(
    page.getByText(/Cut-off has passed for your next delivery/i).first(),
  ).toBeVisible();
  await expect(section.getByText(butter.name, { exact: true })).toBeVisible();
  await expect(section.getByText(/scheduled for removal from/i)).toBeVisible();

  const after = await getState(request, fixture.subscriptionId);
  expect(
    itemQuantity(after.subscription.items, fixture.variants.BUTTER.id),
  ).toBe(1);
  expect(
    itemQuantity(
      after.subscription.pendingChanges?.items,
      fixture.variants.BUTTER.id,
    ),
  ).toBe(0);
  expect(dayKey(after.subscription.pendingChanges?.effectiveFrom)).toBe(
    dayKey(fixture.firstOpenDeliveryDate),
  );

  const lockedAfter = orderForDate(after, fixture.lockedDeliveryDate);
  expect(orderSnapshot(lockedAfter)).toEqual(orderSnapshot(lockedBefore));
  expect(after.stripe.remoteSubscription.currentPriceId).not.toBe(
    before.stripe.remoteSubscription.currentPriceId,
  );
  expect(after.stripe.remoteSubscription.currentPriceId).toBe(
    after.subscription.stripePriceId,
  );
  expect(modificationIntents(after)).toHaveLength(
    modificationIntents(before).length,
  );
});

test("pauses and manually resumes a subscription through the lifecycle UI", async ({
  page,
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    funds: "sufficient",
  });
  const detailPath = `/portal/subscriptions/${fixture.subscriptionId}`;

  await signIn(page, fixture.credentials, detailPath);
  await expect(
    page.getByRole("heading", {
      name: fixture.subscriptionNumber,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "Pause Subscription", exact: true })
    .click();
  const pauseDialog = page.getByRole("dialog", {
    name: "Pause Subscription?",
  });
  await expect(pauseDialog).toContainText("Pauses can last up to 28 days");
  const resumeDateInput = pauseDialog.locator('input[type="date"]');
  await resumeDateInput.fill(fixture.resumeOn);

  const pauseResponsePromise = waitForApiResponse(
    page,
    "POST",
    `/api/portal/subscriptions/${fixture.subscriptionId}/pause`,
  );
  await pauseDialog
    .getByRole("button", { name: "Pause subscription", exact: true })
    .click();
  const pauseBody = await expectApiSuccess(await pauseResponsePromise);
  expect(pauseBody.data?.subscription?.status).toBe("paused");

  await expect(
    page.getByText(
      /This subscription is paused.*No changes can be made while paused, and it will resume automatically/i,
    ),
  ).toBeVisible();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Resume Subscription",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save product changes", exact: true }),
  ).toBeDisabled();

  const pausedState = await getState(request, fixture.subscriptionId);
  expect(pausedState.subscription.status).toBe("paused");
  expect(dayKey(pausedState.subscription.pausedUntil)).toBe(fixture.resumeOn);
  expect(pausedState.stripe.remoteSubscription.pauseCollection?.behavior).toBe(
    "void",
  );

  await page
    .getByRole("button", { name: "Resume Subscription", exact: true })
    .click();
  const resumeDialog = page.getByRole("dialog", {
    name: "Resume Subscription?",
  });
  await expect(resumeDialog).toContainText(
    "resume from the next available delivery date",
  );
  const resumeResponsePromise = waitForApiResponse(
    page,
    "POST",
    `/api/portal/subscriptions/${fixture.subscriptionId}/resume`,
  );
  await resumeDialog
    .getByRole("button", { name: "Resume", exact: true })
    .click();
  const resumeBody = await expectApiSuccess(await resumeResponsePromise);
  expect(resumeBody.data?.subscription?.status).toBe("active");

  await expect(
    page.getByText("Subscription resumed.", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await expect(page.getByText(/This subscription is paused/i)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Pause Subscription", exact: true }),
  ).toBeVisible();

  const resumedState = await getState(request, fixture.subscriptionId);
  expect(resumedState.subscription.status).toBe("active");
  expect(resumedState.subscription.pausedAt).toBeNull();
  expect(resumedState.subscription.pausedUntil).toBeNull();
  expect(resumedState.stripe.remoteSubscription.pauseCollection).toBeNull();
});

test("adds a new default card through a real Stripe Elements SetupIntent", async ({
  page,
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    createSubscription: false,
    withPaymentMethod: false,
  });

  await signIn(page, fixture.credentials, "/portal/payments");
  await expect(
    page.getByRole("heading", { name: "Payments", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Add card details", { exact: true }),
  ).toBeVisible();

  await page.getByPlaceholder("Cardholder name").fill("Stripe E2E Customer");
  await page
    .frameLocator('iframe[title="Secure card number input frame"]')
    .locator('input[name="cardnumber"]')
    .fill("4242424242424242");
  await page
    .frameLocator('iframe[title="Secure expiration date input frame"]')
    .locator('input[name="exp-date"]')
    .fill("1234");
  await page
    .frameLocator('iframe[title="Secure CVC input frame"]')
    .locator('input[name="cvc"]')
    .fill("123");

  const attachResponsePromise = waitForApiResponse(
    page,
    "POST",
    "/api/portal/payments/payment-methods/attach",
  );
  await page.getByRole("button", { name: "Add Card", exact: true }).click();
  const attachBody = await expectApiSuccess(await attachResponsePromise);

  expect(attachBody.data?.paymentMethod).toMatchObject({
    type: "card",
    cardBrand: "visa",
    lastFour: "4242",
    isDefault: true,
  });
  const savedMethod = page
    .getByText(/visa.*4242/i)
    .locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]");
  await expect(savedMethod).toContainText("Default");
  await expect(page.getByText("No payment methods")).toHaveCount(0);
});
