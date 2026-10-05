"use strict";

const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { reset, login } = require("../support/e2e-client");
const {
  API_ORIGIN,
  CLIENT_ORIGIN,
  CONTROL_ORIGIN,
  CONTROL_TOKEN,
} = require("../support/constants");
const ADMIN_ORIGIN = "http://127.0.0.1:4174";
const controlHeaders = { "x-e2e-control-token": CONTROL_TOKEN };

async function fixture(request, options = {}) {
  const response = await request.post(`${CONTROL_ORIGIN}/deal-fixtures`, {
    headers: controlHeaders,
    data: options,
    timeout: 90000,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).data;
}
async function adminLogin(request, credentials) {
  const response = await request.post(`${API_ORIGIN}/api/auth/login`, {
    data: credentials,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}
async function assertNoOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}
test.beforeEach(async ({ request }) => {
  await reset(request);
});
test.afterAll(async ({ request }) => {
  await reset(request);
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`admin creates an imaged offer and customers discover it on ${viewport.name}`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const data = await fixture(request, { createOffer: false });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await adminLogin(page.request, data.adminCredentials);
    await page.goto(`${ADMIN_ORIGIN}/deals/new`);
    await page
      .locator("article")
      .filter({
        has: page.getByRole("heading", {
          name: data.variants.MILK.name,
          exact: true,
        }),
      })
      .getByRole("button", { name: "Add variant Standard" })
      .click();
    await page
      .getByRole("spinbutton", {
        name: `Quantity for Standard (${data.variants.MILK.name})`,
      })
      .fill("2");
    await assertNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`admin-contents-${viewport.name}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Continue to details" }).click();
    const name = `Fresh milk ${viewport.name}`;
    await page.getByLabel("Deal name *").fill(name);
    const clientRoot =
      process.env.E2E_CLIENT_DIR ||
      path.resolve(__dirname, "../../../../Levants-client");
    await page.locator('input[type="file"]').setInputFiles({
      name: "milk.jpg",
      mimeType: "image/jpeg",
      buffer: fs.readFileSync(
        path.join(clientRoot, "src/assets/product-milk.jpg"),
      ),
    });
    await expect(page.getByAltText("Package preview")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`admin-details-${viewport.name}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Set pricing" }).click();
    await page.getByLabel("Package price (£) *").fill("8");
    await assertNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`admin-pricing-${viewport.name}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Review & publish" }).click();
    await assertNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`admin-publish-${viewport.name}.png`),
      fullPage: true,
    });
    const published = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/admin/deals",
    );
    await page.getByRole("button", { name: "Create product package" }).click();
    const response = await published;
    expect(response.status()).toBe(201);
    const offer = (await response.json()).data.deal;
    expect(offer.endsAt).toBeNull();
    expect(offer.packagePrice).toBe(8);
    expect(offer.savings).toBe(2);
    await expect(page).toHaveURL(`${ADMIN_ORIGIN}/deals`);
    await page.screenshot({
      path: testInfo.outputPath(`admin-management-${viewport.name}.png`),
      fullPage: true,
    });
    await page.goto(`${CLIENT_ORIGIN}/`);
    await expect(
      page.getByRole("heading", { name: "Current Deals" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`customer-home-${viewport.name}.png`),
      fullPage: true,
    });
    await page.goto(`${CLIENT_ORIGIN}/deals`);
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await assertNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`customer-deals-${viewport.name}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Add package to basket" }).click();
    await expect(
      page.getByRole("heading", { name: "Your Cart" }),
    ).toBeVisible();
    await page.goto(`${CLIENT_ORIGIN}/login?redirect=%2Fcheckout`);
    await page.getByLabel("Email address").fill(data.credentials.email);
    await page.getByLabel("Password").fill(data.credentials.password);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(page).toHaveURL(`${CLIENT_ORIGIN}/checkout`);
    await expect(
      page.getByRole("heading", { name: "Payment", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await assertNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`customer-checkout-${viewport.name}.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

test("package checkout matches real Stripe totals and fully funded credit fulfils only its components", async ({
  request,
}) => {
  const data = await fixture(request, { creditBalance: 10000 });
  const token = await login(request, data.credentials);
  const payload = {
    items: [{ variantId: data.variants.MILK.id, quantity: 2 }],
    deals: [
      {
        dealId: data.deal._id,
        quantity: 1,
        expectedPackagePrice: 8,
        expectedContents: [{ variantId: data.variants.MILK.id, quantity: 2 }],
      },
    ],
    deliveryAddress: {
      line1: "1 E2E Dairy Lane",
      city: "Bradford",
      postcode: "BD5 0AL",
      country: "UK",
    },
  };
  const checkout = await request.post(
    `${API_ORIGIN}/api/portal/orders/checkout`,
    { headers: { authorization: `Bearer ${token}` }, data: payload },
  );
  expect(checkout.ok(), await checkout.text()).toBeTruthy();
  const result = (await checkout.json()).data;
  const state = await request.get(
    `${CONTROL_ORIGIN}/deal-state/${result.orderId}`,
    { headers: controlHeaders },
  );
  const initial = (await state.json()).data;
  expect(initial.checkout.amount_total).toBe(900);
  expect(initial.order.total).toBe(9);
  expect(initial.order.discountAmount).toBe(2);
  expect(initial.variants[0].reservedQuantity).toBe(2);
  const credit = await request.post(
    `${API_ORIGIN}/api/portal/orders/checkout`,
    {
      headers: { authorization: `Bearer ${token}` },
      data: { ...payload, creditToApplyMinor: 900 },
    },
  );
  expect(credit.ok(), await credit.text()).toBeTruthy();
  const paid = (await credit.json()).data;
  expect(paid.paidWithCredit).toBe(true);
  const paidState = await request.get(
    `${CONTROL_ORIGIN}/deal-state/${paid.orderId}`,
    { headers: controlHeaders },
  );
  const final = (await paidState.json()).data;
  expect(final.order.status).toBe("paid");
  expect(final.order.metadata.deals[0].packagePrice).toBe(8);
  expect(final.variants[0].stockQuantity).toBe(9998);
  expect(final.variants[0].reservedQuantity).toBe(2);
});

for (const mode of ["signed-in", "guest"]) {
  test(`real Stripe card purchase through ${mode} storefront checkout consumes stock exactly once`, async ({
    page,
    request,
  }, testInfo) => {
    const data = await fixture(request);
    if (mode === "signed-in") {
      await page.goto(`${CLIENT_ORIGIN}/login?redirect=%2Fdeals`);
      await page.getByLabel("Email address").fill(data.credentials.email);
      await page.getByLabel("Password").fill(data.credentials.password);
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await expect(page).toHaveURL(`${CLIENT_ORIGIN}/deals`);
    } else {
      await page.goto(`${CLIENT_ORIGIN}/deals`);
    }
    await page.getByRole("button", { name: "Add package to basket" }).click();
    await expect(
      page.getByRole("heading", { name: "Your Cart" }),
    ).toBeVisible();
    await page.goto(`${CLIENT_ORIGIN}/checkout`);
    if (mode === "guest") {
      await page.locator('input[name="firstName"]').fill("Guest");
      await page.locator('input[name="lastName"]').fill("E2E");
      await page
        .locator('input[name="email"]')
        .fill(`guest-deal-${data.scenarioId}@example.com`);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.locator('input[name="address1"]').fill("1 E2E Dairy Lane");
      await page.locator('input[name="city"]').fill("Bradford");
      await page.locator('input[name="postcode"]').fill("BD5 0AL");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
    }
    await expect(
      page.getByRole("heading", { name: "Payment", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Fresh milk package", { exact: true }),
    ).toBeVisible();
    const pathname =
      mode === "guest" ? "/api/orders" : "/api/portal/orders/checkout";
    // Read the real API response before the storefront navigates to Stripe.
    // Chromium discards the original response body during that cross-origin redirect.
    let checkoutData;
    await page.route(`**${pathname}`, async (route) => {
      const upstream = await route.fetch();
      checkoutData = await upstream.json();
      await route.fulfill({ response: upstream });
    });
    const submitted = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === pathname,
    );
    await page
      .getByRole("button", { name: "Place Order - £9.00", exact: true })
      .click();
    const response = await submitted;
    expect(response.ok(), JSON.stringify(checkoutData)).toBeTruthy();
    expect(response.request().postDataJSON()).toMatchObject({
      items: [{ variantId: data.variants.MILK.id, quantity: 2 }],
      deals: [
        {
          dealId: data.deal._id,
          quantity: 1,
          expectedPackagePrice: 8,
          expectedContents: [{ variantId: data.variants.MILK.id, quantity: 2 }],
        },
      ],
    });
    const order = checkoutData.data;
    await page.locator("#cardNumber").fill("4242424242424242");
    await page.locator("#cardExpiry").fill("1234");
    await page.locator("#cardCvc").fill("123");
    await page.locator("#billingName").fill("Deal E2E Customer");
    const country = page.locator("#billingCountry");
    if (await country.isVisible()) await country.selectOption("GB");
    const postcode = page.locator("#billingPostalCode");
    if (await postcode.isVisible()) await postcode.fill("BD5 0AL");
    await page.screenshot({
      path: testInfo.outputPath("stripe-deal-checkout.png"),
      fullPage: true,
    });
    await page
      .locator('button[type="submit"]')
      .filter({ hasText: /Pay/ })
      .click();
    await expect(page).toHaveURL(/\/checkout\/success\?session_id=/, {
      timeout: 60000,
    });
    await expect(
      page.getByRole("heading", { name: "Thank You for Your Order!" }),
    ).toBeVisible();
    const read = async () => {
      const state = await request.get(
        `${CONTROL_ORIGIN}/deal-state/${order.orderId}`,
        { headers: controlHeaders },
      );
      expect(state.ok()).toBeTruthy();
      return (await state.json()).data;
    };
    await expect.poll(async () => (await read()).order.status).toBe("paid");
    if (process.env.E2E_USE_STRIPE_CLI === "1") {
      await expect
        .poll(async () => (await read()).signedCheckoutWebhookReceived, {
          timeout: 30000,
        })
        .toBe(true);
    }
    const state = await read();
    expect(state.checkout.amount_total).toBe(900);
    expect(state.checkout.payment_status).toBe("paid");
    expect(state.order.total).toBe(9);
    expect(state.order.discountAmount).toBe(2);
    expect(state.order.paidAt).toBeTruthy();
    expect(state.order.stripePaymentIntentId).toMatch(/^pi_/);
    expect(state.order.metadata.deals[0].packagePrice).toBe(8);
    expect(state.variants[0].stockQuantity).toBe(9998);
    expect(state.variants[0].reservedQuantity).toBe(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Thank You for Your Order!" }),
    ).toBeVisible();
    const repeated = await read();
    expect(repeated.variants[0].stockQuantity).toBe(9998);
    expect(repeated.variants[0].reservedQuantity).toBe(0);
  });
}

test("admin edits, schedules, deactivates, reactivates and archives a shared offer with persistence", async ({
  page,
  request,
}, testInfo) => {
  const data = await fixture(request);
  await adminLogin(page.request, data.adminCredentials);
  await page.goto(`${ADMIN_ORIGIN}/deals`);
  let row = page.getByRole("row").filter({ hasText: "Fresh milk package" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Edit product package" });
  await expect(dialog.getByLabel("Deal name *")).toHaveValue(
    "Fresh milk package",
  );
  const name = "Weekend milk and butter offer";
  await dialog.getByLabel("Deal name *").fill(name);
  await dialog
    .getByLabel("Find product variant")
    .fill(data.variants.BUTTER.name);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await dialog.getByLabel("Package price (£) *").fill("10");
  // Adding a second product changes the value from £10 to £13.
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("£10.00");
  const readAdmin = async () => {
    const response = await page.request.get(
      `${API_ORIGIN}/api/admin/deals/${data.deal._id}`,
    );
    expect(response.ok()).toBeTruthy();
    return (await response.json()).data.deal;
  };
  let saved = await readAdmin();
  expect(saved.name).toBe(name);
  expect(saved.items).toHaveLength(2);
  expect(saved.packagePrice).toBe(10);
  expect(saved.savings).toBe(3);
  await page.screenshot({
    path: testInfo.outputPath("admin-edited-bundle.png"),
    fullPage: true,
  });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit product package" });
  await dialog
    .getByLabel("Starts at")
    .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await dialog
    .getByLabel("Ends at")
    .fill(new Date(Date.now() + 172800000).toISOString().slice(0, 16));
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(row).toContainText("Scheduled");
  await page.reload();
  await expect(row).toContainText("Scheduled");
  expect(
    (await request.get(`${API_ORIGIN}/api/deals/${saved.slug}`)).status(),
  ).toBe(404);
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit product package" });
  await dialog.getByLabel("Starts at").fill("");
  await dialog.getByLabel("Ends at").fill("");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    (await request.get(`${API_ORIGIN}/api/deals/${saved.slug}`)).status(),
  ).toBe(200);
  await row.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(row).toContainText("Inactive");
  await page.reload();
  await expect(row).toContainText("Inactive");
  expect(
    (await request.get(`${API_ORIGIN}/api/deals/${saved.slug}`)).status(),
  ).toBe(404);
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit product package" });
  await dialog.getByRole("checkbox", { name: "Active on storefront" }).check();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    (await request.get(`${API_ORIGIN}/api/deals/${saved.slug}`)).status(),
  ).toBe(200);
  await row.getByRole("button", { name: "Archive", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Archive product package" })
    .getByRole("button", { name: "Archive deal", exact: true })
    .click();
  await expect(row).toContainText("Archived");
  await page.reload();
  await expect(row).toContainText("Archived");
  await expect(
    row.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  saved = await readAdmin();
  expect(saved.archivedAt).toBeTruthy();
  expect(saved.isActive).toBe(false);
  expect(
    (await request.get(`${API_ORIGIN}/api/deals/${saved.slug}`)).status(),
  ).toBe(404);
});

test("mobile deal details, basket and checkout handle maximum-length content without overflow", async ({
  page,
  request,
}, testInfo) => {
  const data = await fixture(request);
  await adminLogin(page.request, data.adminCredentials);
  const name = "Offer".repeat(28);
  const update = await page.request.patch(
    `${API_ORIGIN}/api/admin/deals/${data.deal._id}`,
    { data: { name, description: "Description".repeat(270) } },
  );
  expect(update.ok(), await update.text()).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  const detailPath = `/deals/${data.deal.slug}`;
  await page.goto(
    `${CLIENT_ORIGIN}/login?redirect=${encodeURIComponent(detailPath)}`,
  );
  await page.getByLabel("Email address").fill(data.credentials.email);
  await page.getByLabel("Password").fill(data.credentials.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(`${CLIENT_ORIGIN}${detailPath}`);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await assertNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("customer-long-name-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add package to basket" }).click();
  await expect(page.getByRole("heading", { name: "Your Cart" })).toBeVisible();
  const title = page.getByRole("heading", { name, exact: true, level: 4 });
  await expect(title).toBeVisible();
  const remove = page.getByRole("button", { name: `Remove ${name}` });
  await expect(remove).toBeInViewport();
  expect(
    await title.evaluate(
      (element) => element.getBoundingClientRect().right <= window.innerWidth,
    ),
  ).toBe(true);
  await assertNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("customer-long-name-basket-mobile.png"),
    fullPage: true,
  });
  await page.goto(`${CLIENT_ORIGIN}/checkout`);
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByText("1 product × 1", { exact: true })).toBeVisible();
  await assertNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("customer-long-name-checkout-mobile.png"),
    fullPage: true,
  });
});
