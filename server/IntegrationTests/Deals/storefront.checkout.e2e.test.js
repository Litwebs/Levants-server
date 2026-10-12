const path = require("path");
const fs = require("fs");
const express = require("express");
const { chromium, expect: browserExpect } = require("@playwright/test");

jest.mock("../../Integration/google.geocode", () => ({
  geocodeAddress: jest.fn(async () => ({ lat: 53.79, lng: -1.75 })),
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
  browser = await chromium.launch();
});

afterEach(async () => {
  if (context) await context.close();
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
  context = await browser.newContext();
  await context.addCookies([{ name: "customerAccessToken", value: jwt.signCustomerAccessToken(customer), url: origin }]);
  await context.addInitScript(() => localStorage.setItem("portal-authenticated", "true"));
  page = await context.newPage();
  // The browser's actual client requests go to the actual Express API and Mongo
  // replica set. Only external payment/geocoding/email transports are mocked.
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const incoming = request.headers();
    const headers = {};
    for (const name of ["cookie", "authorization", "content-type", "accept"]) {
      if (incoming[name]) headers[name] = incoming[name];
    }
    const response = await fetch(apiOrigin + url.pathname + url.search, {
      method: request.method(), headers,
      body: ["GET", "HEAD"].includes(request.method()) ? undefined : request.postData(),
    });
    responses.push([url.pathname, response.status]);
    await route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
  });
  await page.route("https://cdn.test.com/**", route => route.fulfill({
    contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="green"/></svg>',
  }));
  await page.route("https://checkout.stripe.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Test payment transport</h1>" }));
  await page.goto(origin + "/deals");
  const card = page.locator("#all-deals .card-product").filter({ has: page.getByRole("heading", { name: fixture.deal.name, exact: true }) });
  await browserExpect(card.getByText("Save £3.25", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Add to basket", exact: true }).click();
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
  const body = await result.json();
  let order = await Order.findById(body.data.orderId);
  expect(order).toMatchObject({ subtotal: 14.75, discountAmount: 3.25, total: 12.5, creditApplied: credit });
  expect(order.metadata.deals[0]).toMatchObject({ dealId: fixture.deal.id, packagePrice: 11.5, quantity: 1 });
  expect(order.items.map(item => item.quantity)).toEqual([2, 3]);
  if (due > 0) {
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
