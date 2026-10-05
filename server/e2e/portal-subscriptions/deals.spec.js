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
    await page.getByRole("button", { name: "Continue to details" }).click();
    const name = `Fresh milk ${viewport.name}`;
    await page.getByLabel("Deal name *").fill(name);
    const clientRoot =
      process.env.E2E_CLIENT_DIR ||
      path.resolve(__dirname, "../../../../Levants-client");
    await page
      .locator('input[type="file"]')
      .setInputFiles({
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
    await page.getByRole("button", { name: "Review & publish" }).click();
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
    await page.goto(`${CLIENT_ORIGIN}/`);
    await expect(
      page.getByRole("heading", { name: "Current Deals" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
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
    await page.goto(`${CLIENT_ORIGIN}/checkout`);
    await expect(page.getByText(name, { exact: true })).toBeVisible();
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
