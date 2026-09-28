"use strict";

const { test, expect } = require("@playwright/test");
const {
  ADMIN_ORIGIN,
  API_ORIGIN,
  CONTROL_ORIGIN,
  CONTROL_TOKEN,
  createDealsFixture,
  getDealsState,
  mutateDealsFixture,
  redeliverDealCheckoutCompleted,
  reset,
} = require("../support/e2e-client");

const adminUser = {
  id: "admin-deals-e2e",
  name: "Deals E2E Admin",
  email: "admin-deals-e2e@example.com",
  role: {
    _id: "role-admin-deals-e2e",
    name: "admin",
    permissions: ["*"],
  },
  status: "active",
  twoFactorEnabled: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function adminCorsHeaders() {
  return {
    "access-control-allow-origin": ADMIN_ORIGIN,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "content-type": "application/json",
  };
}

async function proxyControl(apiRequest, method, path, data) {
  const options = {
    headers: { "x-e2e-control-token": CONTROL_TOKEN },
    timeout: 60_000,
  };
  if (data !== undefined) options.data = data;

  const response = await apiRequest[method](`${CONTROL_ORIGIN}${path}`, options);
  const body = await response.text();
  return { status: response.status(), body };
}

async function mockAdminApi(page, apiRequest) {
  const adminApi = `${API_ORIGIN}/api`;

  await page.route(`${adminApi}/**`, async (route) => {
    const browserRequest = route.request();
    const url = new URL(browserRequest.url());
    const pathname = url.pathname;
    const method = browserRequest.method();

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: adminCorsHeaders(), body: "" });
      return;
    }

    if (pathname === "/api/auth/authenticated" && method === "GET") {
      await route.fulfill({
        status: 200,
        headers: adminCorsHeaders(),
        body: JSON.stringify({
          success: true,
          data: { authenticated: true, user: adminUser },
        }),
      });
      return;
    }

    if (pathname === "/api/auth/me" && method === "GET") {
      await route.fulfill({
        status: 200,
        headers: adminCorsHeaders(),
        body: JSON.stringify({ success: true, data: { user: adminUser } }),
      });
      return;
    }

    if (pathname === "/api/admin/variants/search" && method === "GET") {
      const proxied = await proxyControl(
        apiRequest,
        "get",
        `/deals/admin-variants?${url.searchParams.toString()}`,
      );
      await route.fulfill({
        status: proxied.status,
        headers: adminCorsHeaders(),
        body: proxied.body,
      });
      return;
    }

    if (pathname === "/api/admin/deals" && method === "GET") {
      const proxied = await proxyControl(
        apiRequest,
        "get",
        `/deals/admin?${url.searchParams.toString()}`,
      );
      const parsed = JSON.parse(proxied.body);
      await route.fulfill({
        status: proxied.status,
        headers: adminCorsHeaders(),
        body: JSON.stringify({
          success: parsed.success,
          data: { deals: parsed.data?.deals || [] },
          meta: parsed.data?.meta,
          message: parsed.message,
        }),
      });
      return;
    }

    if (pathname === "/api/admin/orders" && method === "GET") {
      const proxied = await proxyControl(
        apiRequest,
        "get",
        `/deals/admin-orders?${url.searchParams.toString()}`,
      );
      await route.fulfill({
        status: proxied.status,
        headers: adminCorsHeaders(),
        body: proxied.body,
      });
      return;
    }

    const orderMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
    if (orderMatch && method === "GET") {
      const proxied = await proxyControl(
        apiRequest,
        "get",
        `/deals/admin-orders/${encodeURIComponent(orderMatch[1])}`,
      );
      await route.fulfill({
        status: proxied.status,
        headers: adminCorsHeaders(),
        body: proxied.body,
      });
      return;
    }

    if (pathname === "/api/admin/deals" && method === "POST") {
      const proxied = await proxyControl(
        apiRequest,
        "post",
        "/deals/admin",
        browserRequest.postDataJSON(),
      );
      await route.fulfill({
        status: proxied.status,
        headers: adminCorsHeaders(),
        body: proxied.body,
      });
      return;
    }

    const archiveMatch = pathname.match(
      /^\/api\/admin\/deals\/([^/]+)\/archive$/,
    );
    if (archiveMatch && method === "POST") {
      const proxied = await proxyControl(
        apiRequest,
        "post",
        `/deals/admin/${encodeURIComponent(archiveMatch[1])}/archive`,
      );
      await route.fulfill({
        status: proxied.status,
        headers: adminCorsHeaders(),
        body: proxied.body,
      });
      return;
    }

    const dealMatch = pathname.match(/^\/api\/admin\/deals\/([^/]+)$/);
    if (dealMatch && method === "PATCH") {
      const proxied = await proxyControl(
        apiRequest,
        "patch",
        `/deals/admin/${encodeURIComponent(dealMatch[1])}`,
        browserRequest.postDataJSON(),
      );
      await route.fulfill({
        status: proxied.status,
        headers: adminCorsHeaders(),
        body: proxied.body,
      });
      return;
    }

    if (dealMatch && method === "DELETE") {
      const proxied = await proxyControl(
        apiRequest,
        "delete",
        `/deals/admin/${encodeURIComponent(dealMatch[1])}`,
      );
      await route.fulfill({
        status: proxied.status,
        headers: adminCorsHeaders(),
        body: proxied.body,
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: adminCorsHeaders(),
      body: JSON.stringify({ success: true, data: {} }),
    });
  });
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
  startsAt = "",
  endsAt = "",
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
  if (startsAt) await page.getByLabel("Starts at").fill(startsAt);
  if (endsAt) await page.getByLabel("Ends at").fill(endsAt);

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
    const checkbox = page.getByRole("checkbox", {
      name: "Featured deal",
      exact: true,
    });
    if ((await checkbox.getAttribute("data-state")) !== "checked") {
      await checkbox.click();
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

async function archiveDealViaAdmin(page, name) {
  await page.goto(`${ADMIN_ORIGIN}/deals`);
  const row = page
    .getByText(name, { exact: true })
    .locator("xpath=ancestor::tr[1]");
  await row.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByText("Archive product package", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Archive deal", exact: true }).click();
  await expect(page.getByText("Deal archived", { exact: true })).toBeVisible();
  await expect(row).toContainText("Archived");
  await expect(row.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
}

function toLocalDateTimeInput(date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

async function addDealToCart(page, dealName) {
  await expect(
    page.getByRole("heading", { name: dealName, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add package to basket", exact: true })
    .click();
  await expect(page.getByText(/added to your basket/i)).toBeVisible();

  await expect(page.getByRole("heading", { name: "Your Cart" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 4, name: dealName, exact: true }),
  ).toBeVisible();
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

  await mockAdminApi(adminPage, request);
  const dealName = await createDealViaAdmin(adminPage, fixture);

  const afterCreate = await getDealsState(request, fixture.customer.customerId);
  expect(afterCreate.deals).toHaveLength(1);
  expect(afterCreate.deals[0].name).toBe(dealName);
  expect(Number(afterCreate.deals[0].packagePrice)).toBe(10);
  expect(afterCreate.deals[0].isFeatured).toBe(true);

  await customerSignIn(page, fixture.customer.credentials);
  await addDealToCart(page, dealName);
  await page
    .getByRole("button", { name: "Increase package quantity", exact: true })
    .click();
  await expect(page.getByText("£20.00", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("£21.00", { exact: true }).first()).toBeVisible();
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
  expect(Number(order.subtotal)).toBe(26);
  expect(Number(order.discountAmount)).toBe(6);
  expect(Number(order.deliveryFee)).toBe(1);
  expect(Number(order.total)).toBe(21);
  expect(Number(order.creditApplied)).toBe(2100);
  expect(order.metadata.deals).toHaveLength(1);
  expect(order.metadata.deals[0]).toMatchObject({
    name: dealName,
    quantity: 2,
    packagePrice: 10,
    originalValue: 13,
    saving: 3,
  });
  expect(Number(state.customer.creditBalance)).toBe(2900);

  const milk = variantBySku(state, fixture.variants.MILK.sku);
  const butter = variantBySku(state, fixture.variants.BUTTER.sku);
  expect(Number(milk.stockQuantity)).toBe(4);
  expect(Number(milk.reservedQuantity)).toBe(0);
  expect(Number(butter.stockQuantity)).toBe(4);
  expect(Number(butter.reservedQuantity)).toBe(0);

  await page.goto(`/portal/orders/${order._id}`);
  await expect(page.getByText("Package Deals", { exact: true })).toBeVisible();
  await expect(page.getByText(dealName, { exact: true })).toBeVisible();
  await expect(page.getByText("Quantity 2", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved £6.00", { exact: true })).toBeVisible();
  await expect(page.getByText("£21.00", { exact: true }).last()).toBeVisible();

  await adminPage.goto(`${ADMIN_ORIGIN}/orders`);
  const adminOrderRow = adminPage
    .getByText(fixture.customer.credentials.email, { exact: true })
    .locator("xpath=ancestor::tr[1]");
  await expect(adminOrderRow).toBeVisible();
  await adminOrderRow.click();
  await expect(adminPage.getByText("Package Deals", { exact: true })).toBeVisible();
  await expect(adminPage.getByText(dealName, { exact: true })).toBeVisible();
  await expect(adminPage.getByText("Quantity 2", { exact: true })).toBeVisible();
  await expect(adminPage.getByText("Saved £6.00", { exact: true })).toBeVisible();

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

  await mockAdminApi(adminPage, request);
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

  // The app navigates cross-origin to Stripe immediately after this response.
  // Chromium may release the response body before Playwright can read it, so
  // verify the browser redirect plus the persisted real Stripe session below.
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

  await page.locator('input[name="cardNumber"]').fill("4242424242424242");
  await page.locator('input[name="cardExpiry"]').fill("1234");
  await page.locator('input[name="cardCvc"]').fill("123");
  const billingName = page.locator('input[name="billingName"]');
  if (await billingName.count()) await billingName.fill("Deals E2E Customer");
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/checkout\/success\?session_id=/, { timeout: 60_000 });
  await expect.poll(async () => {
    const paid = await getDealsState(request, fixture.customer.customerId);
    return paid.orders[0]?.status;
  }, { timeout: 60_000 }).toBe("paid");

  const paidState = await getDealsState(request, fixture.customer.customerId);
  expect(paidState.stripeCheckout.paymentStatus).toBe("paid");
  expect(Number(variantBySku(paidState, fixture.variants.MILK.sku).stockQuantity)).toBe(6);
  expect(Number(variantBySku(paidState, fixture.variants.MILK.sku).reservedQuantity)).toBe(0);
  expect(Number(variantBySku(paidState, fixture.variants.BUTTER.sku).stockQuantity)).toBe(5);
  expect(Number(variantBySku(paidState, fixture.variants.BUTTER.sku).reservedQuantity)).toBe(0);

  await redeliverDealCheckoutCompleted(request, paidState.stripeCheckout.id);
  const afterDuplicate = await getDealsState(request, fixture.customer.customerId);
  expect(afterDuplicate.orders[0].status).toBe("paid");
  expect(Number(variantBySku(afterDuplicate, fixture.variants.MILK.sku).stockQuantity)).toBe(6);
  expect(Number(variantBySku(afterDuplicate, fixture.variants.BUTTER.sku).stockQuantity)).toBe(5);

  await adminContext.close();
});

test("scheduled deal stays hidden until active, then archive removes it permanently from storefront and checkout", async ({
  page,
  request,
  browser,
}) => {
  const fixture = await createDealsFixture(request, { creditBalance: 5000 });
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await mockAdminApi(adminPage, request);

  const dealName = await createDealViaAdmin(adminPage, fixture, {
    name: "Scheduled Archive Bundle",
    startsAt: toLocalDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)),
    endsAt: toLocalDateTimeInput(new Date(Date.now() + 2 * 60 * 60 * 1000)),
  });
  const row = adminPage.getByText(dealName, { exact: true }).locator("xpath=ancestor::tr[1]");
  await expect(row).toContainText("Scheduled");

  await customerSignIn(page, fixture.customer.credentials);
  await expect(page.getByRole("heading", { name: dealName, exact: true })).toHaveCount(0);

  await adminPage.goto(`${ADMIN_ORIGIN}/deals`);
  const editRow = adminPage.getByText(dealName, { exact: true }).locator("xpath=ancestor::tr[1]");
  await editRow.getByRole("button", { name: "Edit", exact: true }).click();
  await adminPage.getByLabel("Starts at").fill(
    toLocalDateTimeInput(new Date(Date.now() - 60 * 60 * 1000)),
  );
  await adminPage.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(adminPage.getByText("Deal updated", { exact: true })).toBeVisible();

  await page.goto("/deals");
  await addDealToCart(page, dealName);
  await archiveDealViaAdmin(adminPage, dealName);

  await openCheckout(page);
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/portal/orders/checkout",
  );
  await page.getByRole("button", { name: /Place Order/ }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(400);
  expect((await response.json()).message).toMatch(/no longer available/i);

  const state = await getDealsState(request, fixture.customer.customerId);
  expect(state.orders).toHaveLength(0);
  expect(state.deals[0].archivedAt).toBeTruthy();
  expect(state.deals[0].isActive).toBe(false);
  expect(state.deals[0].isFeatured).toBe(false);

  await page.goto("/deals");
  await expect(page.getByRole("heading", { name: dealName, exact: true })).toHaveCount(0);
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

  await mockAdminApi(adminPage, request);
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

  await mockAdminApi(adminPage, request);
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

  await mockAdminApi(adminPage, request);
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

  await mockAdminApi(adminPage, request);
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
