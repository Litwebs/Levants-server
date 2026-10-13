"use strict";

const { test, expect } = require("@playwright/test");
const { reset } = require("../support/e2e-client");
const { API_ORIGIN, CLIENT_ORIGIN, CONTROL_ORIGIN, CONTROL_TOKEN } = require("../support/constants");
const ADMIN_ORIGIN = "http://127.0.0.1:4174";
const controlHeaders = { "x-e2e-control-token": CONTROL_TOKEN };

test.beforeEach(async ({ request }) => { await reset(request); });
test.afterAll(async ({ request }) => { await reset(request); });

async function setup(page, request) {
  const response = await request.post(`${CONTROL_ORIGIN}/deal-fixtures`, { headers: controlHeaders, data: { basketScenarios: true } });
  expect(response.ok(), await response.text()).toBeTruthy();
  const data = (await response.json()).data;
  const login = await page.request.post(`${API_ORIGIN}/api/auth/login`, { data: data.adminCredentials });
  expect(login.ok(), await login.text()).toBeTruthy();
  await page.goto(`${ADMIN_ORIGIN}/deals/new`);
  for (const key of ["MILK", "BUTTER"]) {
    const row = page.getByRole("row").filter({ hasText: data.variants[key].name });
    await row.getByRole("button", { name: "Add variant Standard", exact: true }).click();
  }
  await page.getByRole("button", { name: "Details & pricing", exact: true }).click();
  await page.getByLabel("Deal name *").fill("Milk and honey package");
  await page.getByLabel("Package price (£) *").fill("6");
  await page.getByRole("button", { name: "Review & publish", exact: true }).click();
  const published = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/admin/deals");
  await page.getByRole("button", { name: "Create product package" }).click();
  const created = await published;
  expect(created.status()).toBe(201);
  const dealB = (await created.json()).data.deal;
  const readDeal = async slug => {
    const result = await request.get(`${API_ORIGIN}/api/deals/${slug}`);
    expect(result.ok(), await result.text()).toBeTruthy();
    return (await result.json()).data.deal;
  };
  return { data, deals: { A: await readDeal(data.deal.slug), B: await readDeal(dealB.slug) } };
}

function cartItem(variant, quantity) {
  return {
    quantity,
    product: { id: variant.productId, name: variant.name, category: "e2e-subscriptions", price: variant.price, images: [], stockStatus: "in-stock" },
    variant: { id: variant.id, name: variant.name === "Other milk variant" ? variant.name : "Standard", price: variant.price, stockQuantity: 10000, stockStatus: "in-stock" },
  };
}

async function openBasket(page, data, deals, manual, explicit) {
  const items = Object.entries(manual).filter(([, quantity]) => quantity).map(([key, quantity]) => cartItem(data.variants[key], quantity));
  const packages = Object.entries(explicit).filter(([, quantity]) => quantity).map(([key, quantity]) => ({ deal: deals[key], quantity }));
  await page.goto(CLIENT_ORIGIN);
  await page.getByRole("button", { name: "Cart", exact: true }).first().waitFor();
  await page.waitForLoadState("networkidle");
  await page.evaluate(value => localStorage.setItem("levants-dairy-cart", JSON.stringify(value)), { items, deals: packages });
  await page.goto(`${CLIENT_ORIGIN}/checkout`);
  if (await page.getByRole("heading", { name: "Your Details" }).isVisible()) {
    await page.getByRole("textbox", { name: "First Name" }).fill("Basket");
    await page.getByRole("textbox", { name: "Last Name" }).fill("Tester");
    await page.getByRole("textbox", { name: "Email" }).fill(`basket-${Date.now()}@example.com`);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.locator('input[name="address1"]').fill("1 E2E Dairy Lane");
    await page.locator('input[name="city"]').fill("Bradford");
    await page.locator('input[name="postcode"]').fill("BD5 0AL");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Payment", exact: true })).toBeVisible();
}

const scenarios = [
  ["one milk", { MILK: 1 }, {}, 5, {}],
  ["two milk", { MILK: 2 }, {}, 8, { A: 1 }],
  ["three milk", { MILK: 3 }, {}, 13, { A: 1 }],
  ["four milk", { MILK: 4 }, {}, 16, { A: 2 }],
  ["milk and honey", { MILK: 1, BUTTER: 1 }, {}, 6, { B: 1 }],
  ["two milk and honey", { MILK: 2, BUTTER: 1 }, {}, 11, { B: 1 }],
  ["two milk and two honey", { MILK: 2, BUTTER: 2 }, {}, 12, { B: 2 }],
  ["three milk and honey", { MILK: 3, BUTTER: 1 }, {}, 14, { A: 1, B: 1 }],
  ["different milk variants", { MILK: 1, OTHER_MILK: 1 }, {}, 10, {}],
  ["incomplete mixed offer", { BUTTER: 1 }, {}, 4, {}],
  ["unrelated eggs stay retail", { EGGS: 1 }, { A: 1 }, 10, { A: 1 }],
  ["explicit A", {}, { A: 1 }, 8, { A: 1 }],
  ["explicit and automatic A", { MILK: 2 }, { A: 1 }, 16, { A: 2 }],
  ["explicit A and automatic B", { MILK: 1, BUTTER: 1 }, { A: 1 }, 14, { A: 1, B: 1 }],
  ["explicit A with retail honey", { BUTTER: 1 }, { A: 1 }, 12, { A: 1 }],
  ["two explicit packages", {}, { A: 1, B: 1 }, 14, { A: 1, B: 1 }],
];

test("admin offers price the storefront basket and checkout correctly", async ({ page, context, request }) => {
  const { data, deals } = await setup(page, request);

  for (const [name, manual, explicit, subtotal, claims] of scenarios) {
    await test.step(name, async () => {
      const basketPage = await context.newPage();
      await basketPage.route("**/api/portal/auth/me", route => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Authentication required" }) }));
      await basketPage.route("**/api/portal/auth/refresh", route => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Authentication required" }) }));
      await basketPage.route("https://checkout.stripe.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Test checkout</h1>" }));
      await openBasket(basketPage, data, deals, manual, explicit);
      const total = subtotal + 1;
      const button = basketPage.getByRole("button", { name: `Place Order - £${total.toFixed(2)}`, exact: true });
      await expect(button).toBeVisible();
      await expect(basketPage.getByLabel("Discount Code", { exact: true })).toHaveCount(Object.keys(claims).length ? 0 : 1);
      let checkoutData;
      await basketPage.route("**/api/orders", async route => {
        const upstream = await route.fetch();
        checkoutData = await upstream.json();
        await route.fulfill({ response: upstream });
      }, { times: 1 });
      const posted = basketPage.waitForRequest(req => req.method() === "POST" && new URL(req.url()).pathname === "/api/orders");
      const completed = basketPage.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/orders");
      await button.click();
      const payload = (await posted).postDataJSON();
      expect(Object.fromEntries((payload.deals || []).map(deal => [deal.dealId, deal.quantity]))).toEqual(
        Object.fromEntries(Object.entries(claims).map(([key, quantity]) => [deals[key].id, quantity])),
      );
      await completed;
      expect(checkoutData?.data?.orderId, JSON.stringify(checkoutData)).toBeTruthy();
      const stateResponse = await request.get(`${CONTROL_ORIGIN}/deal-state/${checkoutData.data.orderId}`, { headers: controlHeaders });
      expect(stateResponse.ok()).toBeTruthy();
      const state = (await stateResponse.json()).data;
      expect(state.order.subtotal - state.order.discountAmount).toBeCloseTo(subtotal, 2);
      expect(state.order.total).toBeCloseTo(total, 2);
      await expect(basketPage).toHaveURL(/checkout\.stripe\.com/);
      await basketPage.close();
    });
  }
});

for (const width of [390, 1440]) test(`manual quantity changes apply and remove savings at ${width}px`, async ({ page, context, request }) => {
  const { data } = await setup(page, request);
  const customer = await context.newPage();
  await customer.setViewportSize({ width, height: 900 });
  await customer.route("**/api/portal/auth/me", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await customer.route("**/api/portal/auth/refresh", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await customer.goto(`${CLIENT_ORIGIN}/product/${data.variants.MILK.productId}?variant=${data.variants.MILK.id}`);
  await customer.getByRole("button", { name: "Add to basket", exact: true }).click();
  const drawer = customer.locator("div.fixed.right-0").filter({ has: customer.getByRole("heading", { name: "Your Cart", exact: true }) });
  const subtotal = drawer.getByText("Subtotal", { exact: true }).locator("..");
  await expect(subtotal).toContainText("£5.00");
  await drawer.getByRole("button", { name: "Increase quantity", exact: true }).click();
  await expect(subtotal).toContainText("£8.00");
  await drawer.getByRole("button", { name: "Increase quantity", exact: true }).click();
  await expect(subtotal).toContainText("£13.00");
  await drawer.getByRole("button", { name: "Decrease quantity", exact: true }).click();
  await drawer.getByRole("button", { name: "Decrease quantity", exact: true }).click();
  await expect(subtotal).toContainText("£5.00");
  await drawer.getByRole("button", { name: "Remove item", exact: true }).click();
  await expect(drawer.getByText("Your cart is empty")).toBeVisible();
  await customer.close();
});

for (const change of ["price", "contents", "deactivated"]) {
  test(`admin ${change} change pauses checkout for basket review`, async ({ page, context, request }) => {
    const { data, deals } = await setup(page, request);
    const customer = await context.newPage();
    await customer.route("**/api/portal/auth/me", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
    await customer.route("**/api/portal/auth/refresh", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
    await openBasket(customer, data, deals, { MILK: 2 }, {});
    const oldButton = customer.getByRole("button", { name: "Place Order - £9.00", exact: true });
    await expect(oldButton).toBeVisible();
    const body = change === "price" ? { packagePrice: 7 } : change === "contents"
      ? { items: [{ variantId: data.variants.MILK.id, quantity: 3 }] }
      : { isActive: false };
    const changed = await page.request.patch(`${API_ORIGIN}/api/admin/deals/${data.deal._id}`, { data: body });
    expect(changed.ok(), await changed.text()).toBeTruthy();
    let orderPosts = 0;
    customer.on("request", request => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/orders") orderPosts += 1;
    });
    await oldButton.click();
    await expect(customer.getByText("Your offers have been updated. Review your basket total, then place your order.")).toBeVisible();
    expect(orderPosts).toBe(0);
    await expect(customer.getByRole("button", { name: `Place Order - £${change === "price" ? "8.00" : "11.00"}`, exact: true })).toBeVisible();
    await customer.close();
  });
}

test("failed offer check leaves checkout retryable and does not submit", async ({ page, context, request }) => {
  const { data, deals } = await setup(page, request);
  const customer = await context.newPage();
  await customer.route("**/api/portal/auth/me", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await customer.route("**/api/portal/auth/refresh", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await openBasket(customer, data, deals, { MILK: 2 }, {});
  const button = customer.getByRole("button", { name: "Place Order - £9.00", exact: true });
  await expect(button).toBeVisible();
  let orderPosts = 0;
  customer.on("request", req => {
    if (req.method() === "POST" && new URL(req.url()).pathname === "/api/orders") orderPosts += 1;
  });
  await customer.route("**/api/deals**", route => route.abort(), { times: 1 });
  await button.click();
  await expect(customer.getByText("Could not check current offers. Please try again.")).toBeVisible();
  expect(orderPosts).toBe(0);
  await expect(button).toBeEnabled();
  await customer.route("https://checkout.stripe.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Test checkout</h1>" }));
  let checkoutData;
  await customer.route("**/api/orders", async route => {
    const upstream = await route.fetch();
    checkoutData = await upstream.json();
    await route.fulfill({ response: upstream });
  }, { times: 1 });
  const retried = customer.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/orders");
  await button.click();
  expect((await retried).ok(), JSON.stringify(checkoutData)).toBeTruthy();
  const stateResponse = await request.get(`${CONTROL_ORIGIN}/deal-state/${checkoutData.data.orderId}`, { headers: controlHeaders });
  expect((await stateResponse.json()).data.order.total).toBe(9);
  await customer.close();
});

test("removing a mixed-package component removes its saving", async ({ page, context, request }) => {
  const { data, deals } = await setup(page, request);
  const customer = await context.newPage();
  await customer.route("**/api/portal/auth/me", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await customer.route("**/api/portal/auth/refresh", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await openBasket(customer, data, deals, { MILK: 1, BUTTER: 1 }, {});
  await expect(customer.getByRole("button", { name: "Place Order - £7.00", exact: true })).toBeVisible();
  await customer.goto(`${CLIENT_ORIGIN}/shop`);
  await customer.getByRole("button", { name: "Cart", exact: true }).first().click();
  const drawer = customer.locator("div.fixed.right-0").filter({ has: customer.getByRole("heading", { name: "Your Cart", exact: true }) });
  const honey = drawer.locator("div.flex.gap-4.p-4").filter({ hasText: data.variants.BUTTER.name });
  await honey.getByRole("button", { name: "Remove item", exact: true }).click();
  await expect(drawer.getByText("Deal savings applied automatically")).toHaveCount(0);
  await expect(drawer.getByText("Subtotal", { exact: true }).locator("..")).toContainText("£5.00");
  await customer.close();
});

test("reload retains four milk and reapplies two automatic packages once", async ({ page, context, request }) => {
  const { data, deals } = await setup(page, request);
  const customer = await context.newPage();
  await customer.route("**/api/portal/auth/me", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await customer.route("**/api/portal/auth/refresh", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await openBasket(customer, data, deals, { MILK: 4 }, {});
  await expect(customer.getByRole("button", { name: "Place Order - £17.00", exact: true })).toBeVisible();
  await customer.reload();
  const stored = await customer.evaluate(() => JSON.parse(localStorage.getItem("levants-dairy-cart")));
  expect(stored.items[0].quantity).toBe(4);
  expect(stored.deals).toEqual([]);
  await customer.getByRole("textbox", { name: "First Name" }).fill("Basket");
  await customer.getByRole("textbox", { name: "Last Name" }).fill("Tester");
  await customer.getByRole("textbox", { name: "Email" }).fill("basket-reload@example.com");
  await customer.getByRole("button", { name: "Continue", exact: true }).click();
  await customer.locator('input[name="address1"]').fill("1 E2E Dairy Lane");
  await customer.locator('input[name="city"]').fill("Bradford");
  await customer.locator('input[name="postcode"]').fill("BD5 0AL");
  await customer.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(customer.getByRole("button", { name: "Place Order - £17.00", exact: true })).toBeVisible();
  await customer.close();
});

for (const [name, manual, explicit, total, stock] of [
  ["automatic package", { MILK: 2 }, {}, 9, 1],
  ["explicit package plus manual units", { MILK: 2 }, { A: 1 }, 17, 3],
]) test(`stock loss for ${name} between quote and order submission rejects without an order`, async ({ page, context, request }) => {
  const { data, deals } = await setup(page, request);
  const customer = await context.newPage();
  await customer.route("**/api/portal/auth/me", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await customer.route("**/api/portal/auth/refresh", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await openBasket(customer, data, deals, manual, explicit);
  const button = customer.getByRole("button", { name: `Place Order - £${total.toFixed(2)}`, exact: true });
  await expect(button).toBeVisible();
  await customer.route("**/api/orders", async route => {
    const changed = await request.post(`${CONTROL_ORIGIN}/deal-test/stock`, {
      headers: controlHeaders, data: { variantId: data.variants.MILK.id, stockQuantity: stock },
    });
    expect(changed.ok(), await changed.text()).toBeTruthy();
    await route.continue();
  }, { times: 1 });
  const submitted = customer.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/orders");
  await button.click();
  expect((await submitted).status()).toBeGreaterThanOrEqual(400);
  const count = await request.get(`${CONTROL_ORIGIN}/deal-test/orders/count`, { headers: controlHeaders });
  expect((await count.json()).data.count).toBe(0);
  await customer.close();
});

test("overlapping offers use largest per-package saving rather than cheapest full basket", async ({ page, context, request }) => {
  const { data, deals } = await setup(page, request);
  const offer = await request.post(`${CONTROL_ORIGIN}/deal-test/offer`, {
    headers: controlHeaders,
    data: {
      name: "Three milk", slug: `three-milk-${data.scenarioId}`,
      items: [{ variant: data.variants.MILK.id, quantity: 3 }], packagePrice: 11.5,
    },
  });
  expect(offer.ok(), await offer.text()).toBeTruthy();
  const customer = await context.newPage();
  await customer.route("**/api/portal/auth/me", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await customer.route("**/api/portal/auth/refresh", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await openBasket(customer, data, deals, { MILK: 4 }, {});
  const button = customer.getByRole("button", { name: "Place Order - £17.50", exact: true });
  await expect(button).toBeVisible();
  await customer.route("https://checkout.stripe.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Test checkout</h1>" }));
  let checkoutData;
  await customer.route("**/api/orders", async route => {
    const upstream = await route.fetch(); checkoutData = await upstream.json();
    await route.fulfill({ response: upstream });
  }, { times: 1 });
  const submitted = customer.waitForRequest(req => req.method() === "POST" && new URL(req.url()).pathname === "/api/orders");
  const completed = customer.waitForResponse(res => res.request().method() === "POST" && new URL(res.url()).pathname === "/api/orders");
  await button.click();
  const payload = (await submitted).postDataJSON();
  expect(payload.deals).toHaveLength(1);
  expect(payload.deals[0].dealId).toBe((await offer.json()).data.id);
  expect((await completed).ok(), JSON.stringify(checkoutData)).toBeTruthy();
  const stateResponse = await request.get(`${CONTROL_ORIGIN}/deal-state/${checkoutData.data.orderId}`, { headers: controlHeaders });
  expect((await stateResponse.json()).data.order.total).toBe(17.5);
  await customer.close();
});

for (const creditBalance of [500, 2000]) {
  test(`account credit of ${creditBalance} pence applies after basket savings`, async ({ page, context, request }) => {
    const response = await request.post(`${CONTROL_ORIGIN}/deal-fixtures`, {
      headers: controlHeaders, data: { basketScenarios: true, creditBalance },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const data = (await response.json()).data;
    const dealResponse = await request.get(`${API_ORIGIN}/api/deals/${data.deal.slug}`);
    const deals = { A: (await dealResponse.json()).data.deal };
    const customer = await context.newPage();
    const signedIn = await customer.request.post(`${API_ORIGIN}/api/portal/auth/login`, { data: data.credentials });
    expect(signedIn.ok(), await signedIn.text()).toBeTruthy();
    await customer.addInitScript(() => localStorage.setItem("portal-authenticated", "true"));
    await customer.route("https://checkout.stripe.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Test checkout</h1>" }));
    await openBasket(customer, data, deals, { MILK: 2 }, {});
    await customer.getByRole("checkbox", { name: /Apply store credit/ }).check();
    const amountDue = creditBalance >= 900 ? 0 : 4;
    const button = customer.getByRole("button", { name: `Place Order - £${amountDue.toFixed(2)}`, exact: true });
    await expect(button).toBeVisible();
    let checkoutData;
    await customer.route("**/api/portal/orders/checkout", async route => {
      const upstream = await route.fetch();
      checkoutData = await upstream.json();
      await route.fulfill({ response: upstream });
    }, { times: 1 });
    const completed = customer.waitForResponse(res => res.request().method() === "POST" && new URL(res.url()).pathname === "/api/portal/orders/checkout");
    await button.click();
    expect((await completed).ok(), JSON.stringify(checkoutData)).toBeTruthy();
    const stateResponse = await request.get(`${CONTROL_ORIGIN}/deal-state/${checkoutData.data.orderId}`, { headers: controlHeaders });
    const state = (await stateResponse.json()).data;
    expect(state.order.total).toBe(9);
    expect(state.order.discountAmount).toBe(2);
    expect(state.order.creditApplied).toBe(Math.min(creditBalance, 900));
    if (creditBalance >= 900) expect(state.order.status).toBe("paid");
    await customer.close();
  });
}

for (const reason of ["expired", "future", "inactive", "archived", "out-of-stock"]) {
  test(`${reason} deal is not automatically applied`, async ({ page, context, request }) => {
    const { data, deals } = await setup(page, request);
    let changed;
    if (reason === "out-of-stock") {
      changed = await request.post(`${CONTROL_ORIGIN}/deal-test/stock`, {
        headers: controlHeaders, data: { variantId: data.variants.MILK.id, stockQuantity: 1 },
      });
    } else if (reason === "archived") {
      changed = await page.request.post(`${API_ORIGIN}/api/admin/deals/${data.deal._id}/archive`);
    } else {
      const body = reason === "expired" ? { endsAt: new Date(Date.now() - 1000).toISOString() }
        : reason === "future" ? { startsAt: new Date(Date.now() + 86400000).toISOString() }
          : { isActive: false };
      changed = await page.request.patch(`${API_ORIGIN}/api/admin/deals/${data.deal._id}`, { data: body });
    }
    expect(changed.ok(), await changed.text()).toBeTruthy();
    const customer = await context.newPage();
    await customer.route("**/api/portal/auth/me", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
    await customer.route("**/api/portal/auth/refresh", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
    await openBasket(customer, data, deals, { MILK: 2 }, {});
    await expect(customer.getByRole("button", { name: "Place Order - £11.00", exact: true })).toBeVisible();
    await expect(customer.getByText("Deal savings applied automatically")).toHaveCount(0);
    await customer.close();
  });
}

test("discount code cannot be combined with savings even if a request is tampered", async ({ page, context, request }) => {
  const { data, deals } = await setup(page, request);
  const customer = await context.newPage();
  await customer.route("**/api/portal/auth/me", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await customer.route("**/api/portal/auth/refresh", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await openBasket(customer, data, deals, { MILK: 2 }, {});
  await expect(customer.getByLabel("Discount Code", { exact: true })).toHaveCount(0);
  await customer.route("**/api/orders", async route => {
    const payload = route.request().postDataJSON();
    await route.continue({ postData: JSON.stringify({ ...payload, discountCode: "EXTRA10" }) });
  }, { times: 1 });
  const rejected = customer.waitForResponse(res => res.request().method() === "POST" && new URL(res.url()).pathname === "/api/orders");
  await customer.getByRole("button", { name: "Place Order - £9.00", exact: true }).click();
  expect((await rejected).status()).toBeGreaterThanOrEqual(400);
  const count = await request.get(`${CONTROL_ORIGIN}/deal-test/orders/count`, { headers: controlHeaders });
  expect((await count.json()).data.count).toBe(0);
  await customer.close();
});

test("a package selected on Deals stays separate from manually added products", async ({ page, context, request }) => {
  const { data, deals } = await setup(page, request);
  const customer = await context.newPage();
  await customer.route("**/api/portal/auth/me", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await customer.route("**/api/portal/auth/refresh", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await customer.goto(`${CLIENT_ORIGIN}/deals/${deals.A.slug}`);
  await customer.getByRole("button", { name: "Add package to basket" }).click();
  for (const key of ["MILK", "BUTTER"]) {
    await customer.goto(`${CLIENT_ORIGIN}/product/${data.variants[key].productId}?variant=${data.variants[key].id}`);
    await customer.getByRole("button", { name: "Add to basket", exact: true }).click();
  }
  await customer.goto(`${CLIENT_ORIGIN}/checkout`);
  await customer.getByRole("textbox", { name: "First Name" }).fill("Basket");
  await customer.getByRole("textbox", { name: "Last Name" }).fill("Tester");
  await customer.getByRole("textbox", { name: "Email" }).fill("deals-page-basket@example.com");
  await customer.getByRole("button", { name: "Continue", exact: true }).click();
  await customer.locator('input[name="address1"]').fill("1 E2E Dairy Lane");
  await customer.locator('input[name="city"]').fill("Bradford");
  await customer.locator('input[name="postcode"]').fill("BD5 0AL");
  await customer.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(customer.getByRole("button", { name: "Place Order - £15.00", exact: true })).toBeVisible();
  await customer.route("https://checkout.stripe.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Test checkout</h1>" }));
  let checkoutData;
  await customer.route("**/api/orders", async route => {
    const upstream = await route.fetch(); checkoutData = await upstream.json();
    await route.fulfill({ response: upstream });
  }, { times: 1 });
  const submitted = customer.waitForRequest(req => req.method() === "POST" && new URL(req.url()).pathname === "/api/orders");
  const completed = customer.waitForResponse(res => res.request().method() === "POST" && new URL(res.url()).pathname === "/api/orders");
  await customer.getByRole("button", { name: "Place Order - £15.00", exact: true }).click();
  const payload = (await submitted).postDataJSON();
  expect(Object.fromEntries(payload.deals.map(deal => [deal.dealId, deal.quantity]))).toEqual({ [deals.A.id]: 1, [deals.B.id]: 1 });
  expect((await completed).ok(), JSON.stringify(checkoutData)).toBeTruthy();
  const stateResponse = await request.get(`${CONTROL_ORIGIN}/deal-state/${checkoutData.data.orderId}`, { headers: controlHeaders });
  expect((await stateResponse.json()).data.order.total).toBe(15);
  await customer.close();
});
