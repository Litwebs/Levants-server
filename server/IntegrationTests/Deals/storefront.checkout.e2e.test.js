const path = require("path");
const fs = require("fs");
const express = require("express");
const { chromium, expect: browserExpect } = require("@playwright/test");

jest.mock("../../Integration/google.geocode", () => ({
  geocodeAddress: jest.fn(async () => ({ lat: 53.79, lng: -1.75 })),
}));

jest.mock("../../Integration/emailTransport", () => ({
  createEmailTransport: () => ({
    emails: { send: jest.fn(async () => ({ data: { id: "mail_deals_fixture" } })) },
    batch: { send: jest.fn(async () => ({ data: { data: [] } })) },
  }),
}));

const app = require("../../Tests/Deals/helpers/testApp");
const { createPackage } = require("../../Tests/Deals/helpers/dealFactory");
const { createCustomer } = require("../../Tests/Orders/helpers/orderFactory");
const Deal = require("../../models/deal.model");
const Order = require("../../models/order.model");
const Customer = require("../../models/customer.model");
const Variant = require("../../models/variant.model");
const stripe = require("../../utils/stripe.util");
const jwt = require("../../utils/jwt.util");
const { HandlePaymentSuccess } = require("../../services/orders/orders.webhook.service");

jest.setTimeout(120000);
let browser, apiServer, storefrontServer, apiOrigin, origin, context, page;
const responses = [];
const checkoutBodies = [];

async function listen(serverApp) {
  const server = await new Promise(resolve => {
    const running = serverApp.listen(0, "127.0.0.1", () => resolve(running));
  });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

beforeAll(async () => {
  const dist = process.env.DEALS_CLIENT_DIST;
  if (!dist || !fs.existsSync(path.join(dist, "index.html"))) {
    throw new Error("DEALS_CLIENT_DIST must identify the built, pinned Levants-client checkout");
  }
  await Deal.init();
  ({ server: apiServer, origin: apiOrigin } = await listen(app));
  const staticApp = express();
  staticApp.use(express.static(dist));
  staticApp.use((req, res) => res.sendFile(path.join(dist, "index.html")));
  ({ server: storefrontServer, origin } = await listen(staticApp));
  process.env.CLIENT_FRONT_URL_DEV = origin;
  browser = await chromium.launch();
});

afterEach(async () => {
  if (context) {
    try {
      if (page && !page.isClosed()) {
        fs.mkdirSync("deals-integration-artifacts", { recursive: true });
        const name = expect.getState().currentTestName.replace(/[^a-z0-9]+/gi, "-").slice(0, 130);
        await page.screenshot({ path: `deals-integration-artifacts/${name}.png`, fullPage: true });
      }
    } finally { await context.close(); }
  }
  context = null;
});

afterAll(async () => {
  if (browser) await browser.close();
  for (const server of [apiServer, storefrontServer]) {
    if (!server) continue;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

async function openBasket(creditBalance = 0) {
  const fixture = await createPackage({ isFeatured: true });
  const customer = await createCustomer();
  customer.isGuest = false;
  customer.status = "active";
  customer.creditBalance = creditBalance;
  customer.addresses = [{ line1: "1 Test Street", city: "Bradford", postcode: "BD1 1AA", country: "GB", isDefault: true }];
  await customer.save();
  responses.length = 0;
  checkoutBodies.length = 0;
  context = await browser.newContext();
  await context.addCookies([{ name: "customerAccessToken", value: jwt.signCustomerAccessToken(customer), url: origin }]);
  await context.addInitScript(() => localStorage.setItem("portal-authenticated", "true"));
  page = await context.newPage();
  // The browser's actual client requests go to the actual Express API and Mongo
  // replica set. External payment, geocoding, email and site-status providers are mocked.
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === "admin.litwebs.co.uk" && url.pathname === "/api/websites/status") {
      return route.fulfill({ headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "Content-Type" }, json: { data: { status: "live" } } });
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const incoming = await request.allHeaders();
    const headers = {};
    for (const name of ["cookie", "authorization", "content-type", "accept"]) {
      if (incoming[name]) headers[name] = incoming[name];
    }
    const response = await fetch(apiOrigin + url.pathname + url.search, {
      method: request.method(), headers,
      body: ["GET", "HEAD"].includes(request.method()) ? undefined : request.postData(),
    });
    const body = await response.text();
    responses.push([url.pathname, response.status]);
    if (url.pathname === "/api/portal/orders/checkout") checkoutBodies.push(JSON.parse(body));
    await route.fulfill({ status: response.status, contentType: "application/json", body });
  });
  await page.route("https://cdn.test.com/**", route => route.fulfill({
    contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="green"/></svg>',
  }));
  await page.route("https://checkout.stripe.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Test payment transport</h1>" }));
  await page.goto(origin + "/deals");
  const card = page.locator("#all-deals .card-product").filter({ has: page.getByRole("heading", { name: fixture.deal.name, exact: true }) });
  await browserExpect(card.getByText("Save £3.25", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Add to basket", exact: true }).click();
  await browserExpect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("levants-dairy-cart") || "{}").deals?.[0]?.quantity)).toBe(1);
  await page.goto(origin + "/checkout");
  await browserExpect(page.getByRole("button", { name: "Place Order - £12.50", exact: true })).toBeVisible();
  return { ...fixture, customer };
}

async function diagnostic(run) {
  try { await run(); }
  catch (error) {
    if (page && !page.isClosed()) {
      fs.mkdirSync("deals-integration-artifacts", { recursive: true });
      await page.screenshot({ path: `deals-integration-artifacts/failure-${Date.now()}.png`, fullPage: true });
    }
    console.warn("Deals browser/API responses:", responses);
    throw error;
  }
}

test.each([0, 500, 2000])("real storefront package checkout and fulfillment with %i pence credit", creditBalance => diagnostic(async () => {
  const fixture = await openBasket(creditBalance);
  const credit = Math.min(creditBalance, 1250);
  if (credit) await page.getByRole("checkbox", { name: /Apply store credit/ }).check();
  const due = (1250 - credit) / 100;
  const checkoutResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/portal/orders/checkout");
  await page.getByRole("button", { name: `Place Order - £${due.toFixed(2)}`, exact: true }).click();
  const result = await checkoutResponse;
  expect(result.status()).toBe(200);
  // Stripe navigation can discard Chrome’s old response-body handle. The bridge
  // retains the exact API body delivered to that browser request.
  const body = checkoutBodies.at(-1);
  let order = await Order.findById(body.data.orderId);
  expect(order).toMatchObject({ subtotal: 14.75, discountAmount: 3.25, total: 12.5, creditApplied: credit });
  expect(order.metadata.deals[0]).toMatchObject({ dealId: fixture.deal.id, packagePrice: 11.5, quantity: 1 });
  expect(order.items.map(item => item.quantity)).toEqual([2, 3]);
  if (due > 0) {
    await browserExpect(page.getByRole("heading", { name: "Test payment transport" })).toBeVisible();
    expect(stripe.coupons.create).toHaveBeenCalledWith(expect.objectContaining({ amount_off: 325 + credit }));
    expect((await Customer.findById(fixture.customer.id)).creditBalance).toBe(creditBalance);
    const paid = { id: order.stripeCheckoutSessionId, payment_intent: `pi_${order.id}`, metadata: { orderId: order.id }, currency: "gbp", amount_subtotal: 1575, amount_total: 1250 - credit, total_details: { amount_discount: 325 + credit } };
    await HandlePaymentSuccess(paid);
    await HandlePaymentSuccess(paid);
  } else {
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    await browserExpect(page.getByRole("heading", { name: "Thank You for Your Order!" })).toBeVisible();
  }
  order = await Order.findById(order.id);
  expect(order.status).toBe("paid");
  expect(order.total).toBe(12.5);
  expect((await Customer.findById(fixture.customer.id)).creditBalance).toBe(creditBalance - credit);
  expect((await Variant.findById(fixture.milkVariant.id)).stockQuantity).toBe(18);
  expect((await Variant.findById(fixture.eggsVariant.id)).stockQuantity).toBe(6);
}));

test("real browser rejects a stale package and refreshes before retrying checkout", () => diagnostic(async () => {
  const fixture = await openBasket();
  await Deal.updateOne({ _id: fixture.deal.id }, { packagePrice: 12 });
  let response = page.waitForResponse(value => new URL(value.url()).pathname === "/api/portal/orders/checkout");
  await page.getByRole("button", { name: "Place Order - £12.50", exact: true }).click();
  expect((await response).status()).toBe(400);
  expect(await Order.countDocuments()).toBe(0);
  expect((await Variant.findById(fixture.milkVariant.id)).reservedQuantity).toBe(0);
  await page.getByRole("button", { name: "Refresh offers", exact: true }).click();
  const retry = page.getByRole("button", { name: "Place Order - £13.00", exact: true });
  await browserExpect(retry).toBeVisible();
  response = page.waitForResponse(value => new URL(value.url()).pathname === "/api/portal/orders/checkout");
  await retry.click();
  expect((await response).status()).toBe(200);
  const order = await Order.findOne();
  expect(order).toMatchObject({ total: 13, discountAmount: 2.75 });
  expect(order.metadata.deals[0].packagePrice).toBe(12);
}));

test("admin API publication, editing, deactivation and archive control the real storefront", () => diagnostic(async () => {
  const fixture = await openBasket();
  const user = await require("../../Tests/helpers/authTestData").createUser({ role: "admin" });
  const headers = { authorization: `Bearer ${jwt.signAccessToken(user)}` };
  const adminRequest = (method, suffix, data) => context.request[method](apiOrigin + "/api/admin/deals" + suffix, { headers, data });
  const created = await adminRequest("post", "", {
    name: "Browser lifecycle package", publicationStatus: "draft", packagePrice: 10,
    description: "Created through the real admin API",
    items: fixture.contents, isFeatured: true,
  });
  expect(created.status()).toBe(201);
  const { deal } = (await created.json()).data;
  const detail = origin + "/deals/" + deal.slug;
  await page.goto(detail);
  await browserExpect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  expect((await adminRequest("post", `/${deal._id}/publish`)).status()).toBe(200);
  await page.reload();
  await browserExpect(page.getByRole("heading", { name: deal.name, exact: true })).toBeVisible();
  await browserExpect(page.getByText("You save £4.75", { exact: true })).toBeVisible();
  await browserExpect(page.getByText("Test Variant × 2", { exact: true })).toBeVisible();
  await browserExpect(page.getByText("Test Variant × 3", { exact: true })).toBeVisible();
  expect((await adminRequest("patch", `/${deal._id}`, { packagePrice: 12, description: "Edited browser package" })).status()).toBe(200);
  await page.reload();
  await browserExpect(page.getByText("You save £2.75", { exact: true })).toBeVisible();
  await browserExpect(page.getByText("Edited browser package", { exact: true })).toBeVisible();
  expect((await adminRequest("delete", `/${deal._id}`)).status()).toBe(200);
  await page.reload();
  await browserExpect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  expect((await adminRequest("patch", `/${deal._id}`, { isActive: true })).status()).toBe(200);
  await page.reload();
  await browserExpect(page.getByRole("heading", { name: deal.name, exact: true })).toBeVisible();
  expect((await adminRequest("post", `/${deal._id}/archive`)).status()).toBe(200);
  await page.reload();
  await browserExpect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
}));

test.each(["draft", "inactive", "future", "expired", "archived"])("real catalog and detail conceal %s packages", state => diagnostic(async () => {
  const fixture = await openBasket();
  const update = {
    draft: { publicationStatus: "draft" }, inactive: { isActive: false },
    future: { startsAt: new Date(Date.now() + 86400000) },
    expired: { endsAt: new Date(Date.now() - 1000) }, archived: { archivedAt: new Date() },
  }[state];
  await Deal.updateOne({ _id: fixture.deal.id }, update);
  await page.goto(origin + "/deals");
  await browserExpect(page.getByText("No deals available right now. Check back soon for new offers.", { exact: true })).toBeVisible();
  await page.goto(origin + "/deals/" + fixture.deal.slug);
  await browserExpect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  expect(await Order.countDocuments()).toBe(0);
}));

test("sold-out package detail prevents basket addition", () => diagnostic(async () => {
  const fixture = await openBasket();
  await Variant.updateOne({ _id: fixture.eggsVariant.id }, { stockQuantity: 0 });
  await page.goto(origin + "/deals/" + fixture.deal.slug);
  await browserExpect(page.getByRole("button", { name: "Currently unavailable", exact: true })).toBeDisabled();
  expect(await Order.countDocuments()).toBe(0);
}));

test("package detail, repeated additions and page reload preserve contents and price", () => diagnostic(async () => {
  const fixture = await openBasket();
  await page.goto(origin + "/deals/" + fixture.deal.slug);
  await browserExpect(page.getByText("You save £3.25", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add package to basket", exact: true }).click();
  await browserExpect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("levants-dairy-cart")).deals[0].quantity)).toBe(2);
  await page.goto(origin + "/checkout");
  await browserExpect(page.getByRole("button", { name: "Place Order - £24.00", exact: true })).toBeVisible();
  await page.reload();
  await browserExpect(page.getByRole("button", { name: "Place Order - £24.00", exact: true })).toBeVisible();
  const response = page.waitForResponse(value => new URL(value.url()).pathname === "/api/portal/orders/checkout");
  await page.getByRole("button", { name: "Place Order - £24.00", exact: true }).click();
  expect((await response).status()).toBe(200);
  const order = await Order.findOne();
  expect(order).toMatchObject({ subtotal: 29.5, discountAmount: 6.5, total: 24 });
  expect(order.items.map(item => item.quantity)).toEqual([4, 6]);
  expect(order.metadata.deals[0]).toMatchObject({ quantity: 2, packagePrice: 11.5 });
}));

const realStripeTest = process.env.DEALS_REAL_STRIPE === "1" ? test : test.skip;
realStripeTest.each([0, 500])("Stripe test-mode hosted browser payment with %i pence credit, signed webhook replay and real refund", creditBalance => diagnostic(async () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_test_") || key === "sk_test_123") throw new Error("Real Stripe browser verification requires a configured Stripe test secret");
  const RealStripe = jest.requireActual("stripe");
  const provider = new RealStripe(key);
  const original = [];
  const forward = (group, method) => {
    const target = group.split(".").reduce((value, part) => value[part], stripe);
    const real = group.split(".").reduce((value, part) => value[part], provider);
    original.push([target[method], target[method].getMockImplementation()]);
    target[method].mockImplementation((...args) => real[method](...args));
  };
  for (const [group, method] of [["coupons", "create"], ["checkout.sessions", "create"], ["checkout.sessions", "retrieve"], ["paymentIntents", "retrieve"], ["refunds", "create"], ["refunds", "retrieve"], ["refunds", "list"], ["webhooks", "constructEvent"]]) forward(group, method);
  let session;
  const cardMinor = 1250 - creditBalance;
  const price = (cardMinor / 100).toFixed(2);
  try {
    const fixture = await openBasket(creditBalance);
    if (creditBalance) await page.getByRole("checkbox", { name: /Apply store credit/ }).check();
    await page.unroute("https://checkout.stripe.com/**");
    const response = page.waitForResponse(value => new URL(value.url()).pathname === "/api/portal/orders/checkout");
    await page.getByRole("button", { name: `Place Order - £${price}`, exact: true }).click();
    expect((await response).status()).toBe(200);
    let order = await Order.findById(checkoutBodies.at(-1).data.orderId);
    session = await provider.checkout.sessions.retrieve(order.stripeCheckoutSessionId);
    expect(session.livemode).toBe(false);
    expect(session.amount_total).toBe(cardMinor);
    expect(session.total_details.amount_discount).toBe(325 + creditBalance);
    await page.waitForURL("https://checkout.stripe.com/**");
    await browserExpect(page.locator("#cardNumber")).toBeVisible({ timeout: 30000 });
    // Hosted Checkout geolocates CI runners to the US. Select the actual UK
    // billing country and GBP rather than entering a postcode into a US ZIP field.
    const country = page.locator("#billingCountry");
    await country.selectOption("GB");
    const sterling = page.getByText(`£${price}`, { exact: true });
    if (await sterling.count()) await sterling.first().click();
    await page.locator("#cardNumber").fill("4242424242424242");
    await page.locator("#cardExpiry").fill("1234");
    await page.locator("#cardCvc").fill("123");
    const name = page.locator("#billingName");
    if (await name.count()) await name.fill("Deals Browser Test");
    const postcode = page.locator("#billingPostalCode");
    if (await postcode.count()) await postcode.fill("BD1 1AA");
    const saveToLink = page.getByRole("checkbox", { name: /Save my information/i });
    if (await saveToLink.count()) await saveToLink.uncheck();
    await page.getByTestId("hosted-payment-submit-button").click();
    await browserExpect.poll(async () => {
      session = await provider.checkout.sessions.retrieve(session.id);
      return session.payment_status;
    }, { timeout: 90000 }).toBe("paid");
    await page.waitForURL(origin + "/checkout/success**", { timeout: 30000 });
    await browserExpect(page.getByRole("heading", { name: "Thank You for Your Order!", exact: true })).toBeVisible({ timeout: 30000 });
    await browserExpect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("levants-dairy-cart") || "{}").deals?.length || 0)).toBe(0);
    const webhookSecret = "whsec_isolated_deals_browser_test";
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    const payload = JSON.stringify({ id: "evt_deals_browser_" + order.id, type: "checkout.session.completed", data: { object: session } });
    const signature = provider.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    for (let replay = 0; replay < 2; replay++) {
      const result = await context.request.post(apiOrigin + "/api/webhooks/stripe", { data: payload, headers: { "content-type": "application/json", "stripe-signature": signature } });
      expect(result.status()).toBe(200);
    }
    order = await Order.findById(order.id);
    expect(order.status).toBe("paid");
    expect(order.creditApplied).toBe(creditBalance);
    expect((await Customer.findById(fixture.customer.id)).creditBalance).toBe(0);
    expect((await Variant.findById(fixture.milkVariant.id)).stockQuantity).toBe(18);
    expect((await Variant.findById(fixture.eggsVariant.id)).stockQuantity).toBe(6);
    const refunded = await require("../../services/orders/orders.refund.service").RefundOrder({ orderId: order.id, restock: true });
    expect(refunded.success).toBe(true);
    const refund = await provider.refunds.retrieve(refunded.data.refundId);
    expect(refund).toMatchObject({ amount: cardMinor, status: "succeeded" });
    expect((await Variant.findById(fixture.milkVariant.id)).stockQuantity).toBe(20);
    expect((await Variant.findById(fixture.eggsVariant.id)).stockQuantity).toBe(9);
  } finally {
    if (session) {
      const current = await provider.checkout.sessions.retrieve(session.id);
      if (current.status === "open") await provider.checkout.sessions.expire(session.id);
      if (current.payment_status === "paid") {
        const refunds = await provider.refunds.list({ payment_intent: current.payment_intent });
        if (!refunds.data.some(refund => refund.status === "succeeded" && refund.amount === cardMinor)) await provider.refunds.create({ payment_intent: current.payment_intent });
      }
    }
    for (const [mock, implementation] of original) mock.mockImplementation(implementation);
  }
}), 180000);
