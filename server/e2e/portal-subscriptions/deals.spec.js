"use strict";

const { test, expect } = require("@playwright/test");
const {
  ADMIN_ORIGIN,
  createDealsFixture,
  getDealsState,
  mutateDealsFixture,
  reset,
} = require("../support/e2e-client");

async function adminSignIn(page, credentials) {
  await page.goto(`${ADMIN_ORIGIN}/login`);
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await Promise.all([
    page.waitForURL((url) => url.origin === ADMIN_ORIGIN && url.pathname === "/"),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
}

async function customerSignIn(page, credentials, redirect = "/deals") {
  await page.goto(`/login?redirect=${encodeURIComponent(redirect)}`);
  await page.getByLabel("Email address").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === redirect),
    page.getByRole("button", { name: "Sign In", exact: true }).click(),
  ]);
}

async function addVariantFromAdmin(page, search, expectedProductName) {
  const input = page.getByLabel("Find product variant");
  await input.fill(search);

  const result = page
    .getByText(expectedProductName, { exact: false })
    .last()
    .locator("xpath=ancestor::div[.//button[normalize-space()='Add']][1]");

  await expect(result).toBeVisible();
  await result.getByRole("button", { name: "Add", exact: true }).click();
  await input.fill("");
}

async function createDealViaAdmin(page, fixture, {
  name = "E2E Family Dairy Bundle",
  packagePrice = "10",
  featured = true,
} = {}) {
  await page.goto(`${ADMIN_ORIGIN}/deals`);
  await expect(
    page.getByText("Deals & Product Packages", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "New Deal", exact: true }).click();
  await expect(
    page.getByText("Create product package", { exact: true }),
  ).toBeVisible();

  await page.getByLabel("Deal name *").fill(name);
  await page.getByLabel("Package price (£) *").fill(packagePrice);

  await addVariantFromAdmin(
    page,
    fixture.variants.MILK.sku,
    fixture.variants.MILK.productName,
  );
  await addVariantFromAdmin(
    page,
    fixture.variants.BUTTER.sku,
    fixture.variants.BUTTER.productName,
  );

  const qtyInputs = page.getByLabel("Quantity for Standard");
  await expect(qtyInputs).toHaveCount(2);
  await qtyInputs.nth(0).fill("2");

  if (featured) {
    const featuredLabel = page
      .getByText("Featured deal", { exact: true })
      .locator("xpath=ancestor::label[1]");
    const checkbox = featuredLabel.getByRole("checkbox");
    if ((await checkbox.getAttribute("data-state")) !== "checked") {
      await featuredLabel.click();
    }
  }

  await expect(page.getByText("£13.00", { exact: true })).toBeVisible();
  await expect(page.getByText("£3.00 · 23%", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Create deal", exact: true }).click();
  await expect(page.getByText("Deal created", { exact: true })).toBeVisible();

  const row = page
    .getByText(name, { exact: true })
    .locator("xpath=ancestor::tr[1]");
  await expect(row).toContainText("£13.00");
  await expect(row).toContainText("£10.00");
  await expect(row).toContainText("£3.00 (23%)");
  await expect(row).toContainText("Featured");

  return name;
}

async function editDealPriceViaAdmin(page, name, nextPrice) {
  await page.goto(`${ADMIN_ORIGIN}/deals`);
  const row = page
    .getByText(name, { exact: true })
    .locator("xpath=ancestor::tr[1]");
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByText("Edit product package", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Package price (£) *").fill(String(nextPrice));
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Deal updated", { exact: true })).toBeVisible();
}

async function deactivateDealViaAdmin(page, name) {
  await page.goto(`${ADMIN_ORIGIN}/deals`);
  const row = page
    .getByText(name, { exact: true })
    .locator("xpath=ancestor::tr[1]");
  await row.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(page.getByText("Deal deactivated", { exact: true })).toBeVisible();
  await expect(row).toContainText("Inactive");
}

async function addDealToCart(page, dealName) {
  await expect(
    page.getByRole("heading", { name: dealName, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add package to basket", exact: true })
    .click();
  await expect(page.getByText(/added to your basket/i)).toBeVisible();

  await page.getByRole("button", { name: "Cart", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your Cart" })).toBeVisible();
  await expect(page.getByText(dealName, { exact: true })).toBeVisible();
  await expect(page.getByText("£10.00", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("£11.00", { exact: true }).first()).toBeVisible();
}

async function openCheckout(page) {
  await page.getByRole("link", { name: "Checkout Securely", exact: true }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(
    page.getByRole("heading", { name: "Payment", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Package savings applied", { exact: true })).toBeVisible();
}

function variantBySku(state, sku) {
  return state.variants.find((variant) => variant.sku === sku);
}

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test.afterAll(async ({ request }) => {
  await reset(request);
});

test("admin-created featured package completes through the real storefront with store credit and persists exact business results", async ({
  page,
  request,
  browser,
}) => {
  const fixture = await createDealsFixture(request, { creditBalance: 5000 });
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();

  await adminSignIn(adminPage, fixture.admin.credentials);
  const dealName = await createDealViaAdmin(adminPage, fixture);

  const afterCreate = await getDealsState(request, fixture.customer.customerId);
  expect(afterCreate.deals).toHaveLength(1);
  expect(afterCreate.deals[0].name).toBe(dealName);
  expect(Number(afterCreate.deals[0].packagePrice)).toBe(10);
  expect(afterCreate.deals[0].isFeatured).toBe(true);

  await customerSignIn(page, fixture.customer.credentials);
  await addDealToCart(page, dealName);
  await openCheckout(page);

  const creditLabel = page
    .getByText("Apply store credit", { exact: true })
    .locator("xpath=ancestor::label[1]");
  await creditLabel.click();
  await expect(
    page.getByRole("button", { name: "Place Order - £0.00", exact: true }),
  ).toBeVisible();

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/portal/orders/checkout",
  );

  await page
    .getByRole("button", { name: "Place Order - £0.00", exact: true })
    .click();

  const checkoutResponse = await responsePromise;
  expect(checkoutResponse.status()).toBe(200);
  const checkoutBody = await checkoutResponse.json();
  expect(checkoutBody.success).toBe(true);
  expect(checkoutBody.data.paidWithCredit).toBe(true);

  await expect(page).toHaveURL(/\/checkout\/success\?credit=1&order_id=/);

  const state = await getDealsState(request, fixture.customer.customerId);
  expect(state.orders).toHaveLength(1);
  const order = state.orders[0];
  expect(String(order._id)).toBe(String(checkoutBody.data.orderId));
  expect(order.status).toBe("paid");
  expect(Number(order.subtotal)).toBe(13);
  expect(Number(order.discountAmount)).toBe(3);
  expect(Number(order.deliveryFee)).toBe(1);
  expect(Number(order.total)).toBe(11);
  expect(Number(order.creditApplied)).toBe(1100);
  expect(order.metadata.deals).toHaveLength(1);
  expect(order.metadata.deals[0]).toMatchObject({
    name: dealName,
    quantity: 1,
    packagePrice: 10,
    originalValue: 13,
    saving: 3,
  });
  expect(Number(state.customer.creditBalance)).toBe(3900);

  const milk = variantBySku(state, fixture.variants.MILK.sku);
  const butter = variantBySku(state, fixture.variants.BUTTER.sku);
  expect(Number(milk.stockQuantity)).toBe(6);
  expect(Number(milk.reservedQuantity)).toBe(0);
  expect(Number(butter.stockQuantity)).toBe(5);
  expect(Number(butter.reservedQuantity)).toBe(0);

  await page.goto(`/portal/orders/${order._id}`);
  await expect(page.getByText("Package Deals", { exact: true })).toBeVisible();
  await expect(page.getByText(dealName, { exact: true })).toBeVisible();
  await expect(page.getByText("Saved £3.00", { exact: true })).toBeVisible();
  await expect(page.getByText("£11.00", { exact: true }).last()).toBeVisible();

  await adminPage.goto(`${ADMIN_ORIGIN}/orders`);
  const adminOrderRow = adminPage
    .getByText(fixture.customer.credentials.email, { exact: true })
    .locator("xpath=ancestor::tr[1]");
  await expect(adminOrderRow).toBeVisible();
  await adminOrderRow.click();
  await expect(adminPage.getByText("Package Deals", { exact: true })).toBeVisible();
  await expect(adminPage.getByText(dealName, { exact: true })).toBeVisible();
  await expect(adminPage.getByText("Saved £3.00", { exact: true })).toBeVisible();

  await adminContext.close();
});

test("browser checkout creates a real Stripe test-mode session with exact package pricing and reservations", async ({
  page,
  request,
  browser,
}) => {
  const fixture = await createDealsFixture(request, { creditBalance: 0 });
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();

  await adminSignIn(adminPage, fixture.admin.credentials);
  const dealName = await createDealViaAdmin(adminPage, fixture);

  await customerSignIn(page, fixture.customer.credentials);
  await addDealToCart(page, dealName);
  await openCheckout(page);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/portal/orders/checkout",
  );

  await page
    .getByRole("button", { name: "Place Order - £11.00", exact: true })
    .click();

  const checkoutResponse = await responsePromise;
  expect(checkoutResponse.status()).toBe(200);
  const body = await checkoutResponse.json();
  expect(body.success).toBe(true);
  expect(body.data.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);

  const state = await getDealsState(request, fixture.customer.customerId);
  expect(state.orders).toHaveLength(1);
  const order = state.orders[0];
  expect(order.status).toBe("pending");
  expect(Number(order.subtotal)).toBe(13);
  expect(Number(order.discountAmount)).toBe(3);
  expect(Number(order.total)).toBe(11);

  const milk = variantBySku(state, fixture.variants.MILK.sku);
  const butter = variantBySku(state, fixture.variants.BUTTER.sku);
  expect(Number(milk.stockQuantity)).toBe(8);
  expect(Number(milk.reservedQuantity)).toBe(2);
  expect(Number(butter.stockQuantity)).toBe(6);
  expect(Number(butter.reservedQuantity)).toBe(1);

  expect(state.stripeCheckout).toBeTruthy();
  expect(state.stripeCheckout.id).toBe(order.stripeCheckoutSessionId);
  expect(state.stripeCheckout.amountSubtotal).toBe(1400);
  expect(state.stripeCheckout.amountTotal).toBe(1100);
  expect(state.stripeCheckout.currency).toBe("gbp");
  expect(state.stripeCheckout.totalDetails.amount_discount).toBe(300);
  expect(state.stripeCheckout.metadata).toMatchObject({
    orderId: String(order._id),
    dealDiscountMinor: "300",
  });
  expect(state.stripeCheckout.metadata.dealIds).toContain(
    String(state.deals[0]._id),
  );

  await expect
    .poll(() => page.url(), { timeout: 30_000 })
    .toMatch(/^https:\/\/checkout\.stripe\.com\//);

  await adminContext.close();
});

test("stale package price is rejected after an admin edit with no order or inventory side effects", async ({
  page,
  request,
  browser,
}) => {
  const fixture = await createDealsFixture(request, { creditBalance: 5000 });
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();

  await adminSignIn(adminPage, fixture.admin.credentials);
  const dealName = await createDealViaAdmin(adminPage, fixture);

  await customerSignIn(page, fixture.customer.credentials);
  await addDealToCart(page, dealName);

  await editDealPriceViaAdmin(adminPage, dealName, 9);

  await openCheckout(page);
  const creditLabel = page
    .getByText("Apply store credit", { exact: true })
    .locator("xpath=ancestor::label[1]");
  await creditLabel.click();

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/portal/orders/checkout",
  );
  await page.getByRole("button", { name: /Place Order/ }).click();

  const response = await responsePromise;
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.message).toMatch(/price has changed/i);

  const state = await getDealsState(request, fixture.customer.customerId);
  expect(state.orders).toHaveLength(0);
  const milk = variantBySku(state, fixture.variants.MILK.sku);
  const butter = variantBySku(state, fixture.variants.BUTTER.sku);
  expect(Number(milk.reservedQuantity)).toBe(0);
  expect(Number(butter.reservedQuantity)).toBe(0);
  expect(Number(state.customer.creditBalance)).toBe(5000);

  await adminContext.close();
});

test("package deactivated after carting is rejected and disappears from the live storefront", async ({
  page,
  request,
  browser,
}) => {
  const fixture = await createDealsFixture(request, { creditBalance: 5000 });
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();

  await adminSignIn(adminPage, fixture.admin.credentials);
  const dealName = await createDealViaAdmin(adminPage, fixture);

  await customerSignIn(page, fixture.customer.credentials);
  await addDealToCart(page, dealName);

  await deactivateDealViaAdmin(adminPage, dealName);

  await openCheckout(page);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/portal/orders/checkout",
  );
  await page.getByRole("button", { name: /Place Order/ }).click();

  const response = await responsePromise;
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.message).toMatch(/no longer available/i);

  const state = await getDealsState(request, fixture.customer.customerId);
  expect(state.orders).toHaveLength(0);

  await page.goto("/deals");
  await expect(
    page.getByRole("heading", { name: dealName, exact: true }),
  ).toHaveCount(0);

  await adminContext.close();
});

test("stock reserved by another buyer after carting blocks checkout without overselling or charging credit", async ({
  page,
  request,
  browser,
}) => {
  const fixture = await createDealsFixture(request, {
    creditBalance: 5000,
    milkStock: 2,
    butterStock: 1,
  });
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();

  await adminSignIn(adminPage, fixture.admin.credentials);
  const dealName = await createDealViaAdmin(adminPage, fixture);

  await customerSignIn(page, fixture.customer.credentials);
  await addDealToCart(page, dealName);

  await mutateDealsFixture(request, {
    variantId: fixture.variants.MILK.id,
    reservedQuantity: 2,
  });

  await openCheckout(page);
  const creditLabel = page
    .getByText("Apply store credit", { exact: true })
    .locator("xpath=ancestor::label[1]");
  await creditLabel.click();

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/portal/orders/checkout",
  );
  await page.getByRole("button", { name: /Place Order/ }).click();

  const response = await responsePromise;
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.message).toMatch(/not enough stock/i);

  const state = await getDealsState(request, fixture.customer.customerId);
  expect(state.orders).toHaveLength(0);
  expect(Number(state.customer.creditBalance)).toBe(5000);
  const milk = variantBySku(state, fixture.variants.MILK.sku);
  expect(Number(milk.reservedQuantity)).toBe(2);

  await adminContext.close();
});

test("archiving a component product after carting invalidates the package at checkout", async ({
  page,
  request,
  browser,
}) => {
  const fixture = await createDealsFixture(request, { creditBalance: 5000 });
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();

  await adminSignIn(adminPage, fixture.admin.credentials);
  const dealName = await createDealViaAdmin(adminPage, fixture);

  await customerSignIn(page, fixture.customer.credentials);
  await addDealToCart(page, dealName);

  await mutateDealsFixture(request, {
    variantId: fixture.variants.MILK.id,
    productStatus: "archived",
  });

  await openCheckout(page);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/portal/orders/checkout",
  );
  await page.getByRole("button", { name: /Place Order/ }).click();

  const response = await responsePromise;
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.message).toMatch(/product in this deal is no longer available/i);

  const state = await getDealsState(request, fixture.customer.customerId);
  expect(state.orders).toHaveLength(0);
  expect(Number(state.customer.creditBalance)).toBe(5000);

  await adminContext.close();
});
