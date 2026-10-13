const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const { chromium, expect: browserExpect } = require("@playwright/test");
jest.mock("../../Integration/emailTransport", () => ({ createEmailTransport: () => ({ emails: { send: jest.fn(async () => ({ data: { id: "test-email" } })) } }) }));
const app = require("../../Tests/Deals/helpers/testApp");
const Deal = require("../../models/deal.model");
const Order = require("../../models/order.model");
const Variant = require("../../models/variant.model");
const Customer = require("../../models/customer.model");
const stripe = require("../../utils/stripe.util");
const jwt = require("../../utils/jwt.util");
const { createBasketFixture, basketFor, expectedQuantities } = require("./basketFixtures.cjs");

jest.setTimeout(45000);
let browser, apiServer, storefrontServer, apiOrigin, origin, context, page;
let checkoutRequests = [];
let checkoutResponses = [];
let blockOfferChecks = false;
async function listen(application) {
  const server = await new Promise(resolve => { const server = application.listen(0, "127.0.0.1", () => resolve(server)); });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
beforeAll(async () => {
  const dist = process.env.DEALS_CLIENT_DIST;
  if (!dist || !fs.existsSync(path.join(dist, "index.html"))) throw Error("Build storefront and set DEALS_CLIENT_DIST");
  await Deal.init();
  ({ server: apiServer, origin: apiOrigin } = await listen(app));
  const storefront = express();
  storefront.use(express.static(dist));
  storefront.use((req, res) => res.sendFile(path.join(dist, "index.html")));
  ({ server: storefrontServer, origin } = await listen(storefront));
  process.env.CLIENT_FRONT_URL_DEV = origin;
  browser = await chromium.launch();
});
afterEach(async () => {
  if (!context) return;
  if (page && !page.isClosed()) {
    const name = expect.getState().currentTestName.replace(/[^a-z0-9]+/gi, "-").slice(0, 170);
    fs.mkdirSync("deals-integration-artifacts", { recursive: true });
    await page.screenshot({ path: `deals-integration-artifacts/${name}.png`, fullPage: true });
  }
  await context.close();
  context = null;
});
afterAll(async () => {
  if (browser) await browser.close();
  for (const server of [apiServer, storefrontServer]) if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

async function open(fixture, basket, { width = 1440 } = {}) {
  checkoutRequests = []; checkoutResponses = []; blockOfferChecks = false;
  context = await browser.newContext({ viewport: { width, height: 1000 } });
  await context.addCookies([{ name: "customerAccessToken", value: jwt.signCustomerAccessToken(fixture.customer), url: origin }]);
  await context.addInitScript(({ basket }) => {
    localStorage.setItem("portal-authenticated", "true");
    if (!localStorage.getItem("levants-dairy-cart")) localStorage.setItem("levants-dairy-cart", JSON.stringify(basket));
  }, { basket });
  page = await context.newPage();
  await page.route("**/api/**", async route => {
    const incoming = route.request();
    const url = new URL(incoming.url());
    if (url.hostname === "admin.litwebs.co.uk") return route.fulfill({ headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "Content-Type" }, json: { data: { status: "live" } } });
    if (url.origin !== origin || !url.pathname.startsWith("/api/")) return route.continue();
    if (blockOfferChecks && url.pathname.startsWith("/api/deals")) return route.abort();
    const headers = {};
    const original = await incoming.allHeaders();
    for (const key of ["cookie", "authorization", "accept", "content-type"]) if (original[key]) headers[key] = original[key];
    if (url.pathname === "/api/portal/orders/checkout") checkoutRequests.push(incoming.postDataJSON());
    const response = await fetch(apiOrigin + url.pathname + url.search, { method: incoming.method(), headers, body: ["GET", "HEAD"].includes(incoming.method()) ? undefined : incoming.postData() });
    const body = await response.text();
    if (url.pathname === "/api/portal/orders/checkout") checkoutResponses.push(JSON.parse(body));
    await route.fulfill({ status: response.status, contentType: "application/json", body });
  });
  await page.route("https://cdn.test.com/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="green"/></svg>' }));
  await page.route("https://checkout.stripe.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Test checkout</h1>" }));
  await page.goto(origin + "/checkout");
}

async function submit(total) {
  const response = page.waitForResponse(response => new URL(response.url()).pathname === "/api/portal/orders/checkout");
  await page.getByRole("button", { name: `Place Order - £${total.toFixed(2)}`, exact: true }).click();
  expect((await response).status()).toBe(200);
  return Order.findById(checkoutResponses.at(-1).data.orderId).lean();
}

const combinations = [
  ["one milk, no complete offer", { Milk: 1 }, {}, 5, {}],
  ["exact milk pair", { Milk: 2 }, {}, 8, { A: 1 }],
  ["milk pair with leftover", { Milk: 3 }, {}, 13, { A: 1 }],
  ["repeated milk pairs", { Milk: 4 }, {}, 16, { A: 2 }],
  ["exact mixed package", { Milk: 1, Honey: 1 }, {}, 6, { B: 1 }],
  ["overlap with leftover milk", { Milk: 2, Honey: 1 }, {}, 11, { B: 1 }],
  ["repeated mixed packages", { Milk: 2, Honey: 2 }, {}, 12, { B: 2 }],
  ["two different automatic packages", { Milk: 3, Honey: 1 }, {}, 14, { A: 1, B: 1 }],
  ["different milk variants do not form a pair", { Milk: 1, OtherMilk: 1 }, {}, 10, {}],
  ["mixed package missing milk", { Honey: 1 }, {}, 4, {}],
  ["explicit package alone", {}, { A: 1 }, 8, { A: 1 }],
  ["explicit plus same automatic package", { Milk: 2 }, { A: 1 }, 16, { A: 2 }],
  ["explicit plus different automatic package", { Milk: 1, Honey: 1 }, { A: 1 }, 14, { A: 1, B: 1 }],
  ["explicit contents cannot be reassigned", { Honey: 1 }, { A: 1 }, 12, { A: 1 }],
  ["multiple explicit packages", {}, { A: 1, B: 1 }, 14, { A: 1, B: 1 }],
  ["explicit mixed package plus manual milk", { Milk: 1 }, { B: 1 }, 11, { B: 1 }],
  ["unrelated product stays retail", { Milk: 2, Juice: 1 }, {}, 11, { A: 1 }],
];

test.each(combinations)("basket combination: %s", async (name, quantities, packages, subtotal, claims) => {
  const fixture = await createBasketFixture();
  await open(fixture, basketFor(fixture, quantities, packages), { width: name.includes("leftover") ? 390 : 1440 });
  await browserExpect(page.getByRole("button", { name: `Place Order - £${(subtotal + 1).toFixed(2)}`, exact: true })).toBeVisible();
  await browserExpect(page.getByLabel("Discount Code", { exact: true })).toHaveCount(Object.keys(claims).length ? 0 : 1);
  const order = await submit(subtotal + 1);
  expect(order.total).toBe(subtotal + 1);
  const expected = expectedQuantities(fixture, quantities, packages);
  expect(Object.fromEntries(order.items.map(item => [String(item.variant), item.quantity]))).toEqual(expected);
  expect(Object.fromEntries((order.metadata?.deals || []).map(deal => [deal.dealId, deal.quantity]))).toEqual(Object.fromEntries(Object.entries(claims).map(([key, quantity]) => [fixture.deals[key].id, quantity])));
  expect(order.discountAmount).toBe(Number((order.subtotal - subtotal).toFixed(2)));
  for (const [id, quantity] of Object.entries(expected)) expect((await Variant.findById(id)).reservedQuantity).toBe(quantity);
  expect(checkoutRequests).toHaveLength(1);
  expect(new Set((checkoutRequests[0].deals || []).map(claim => claim.dealId)).size).toBe((checkoutRequests[0].deals || []).length);
});

test("overlap limitation: largest saving per package is deterministic, not an optimal-price guarantee", async () => {
  const fixture = await createBasketFixture();
  await Deal.create({ name: "Three milk", slug: "three-milk", items: [{ variant: fixture.variants.Milk.id, quantity: 3 }], packagePrice: 11.5 });
  await open(fixture, basketFor(fixture, { Milk: 4 }));
  const order = await submit(17.5);
  expect(order.total).toBe(17.5); // £16.50 products + £1 delivery; two pairs would be £17.
});

test.each(["expired", "future", "inactive", "archived", "out-of-stock"])("ineligible offer: %s", async reason => {
  const fixture = await createBasketFixture();
  const updates = { expired: { endsAt: new Date(Date.now() - 1000) }, future: { startsAt: new Date(Date.now() + 86400000) }, inactive: { isActive: false }, archived: { archivedAt: new Date(), isActive: false } };
  if (reason === "out-of-stock") {
    await Variant.updateOne({ _id: fixture.variants.Milk.id }, { stockQuantity: 1 });
  } else await Deal.updateOne({ _id: fixture.deals.A.id }, updates[reason]);
  await open(fixture, basketFor(fixture, { Milk: 2 }));
  await browserExpect(page.getByRole("button", { name: "Place Order - £11.00", exact: true })).toBeVisible();
  await browserExpect(page.getByText("Deal savings applied automatically")).toHaveCount(0);
  if (reason !== "out-of-stock") expect((await submit(11)).metadata?.deals || []).toHaveLength(0);
});

test.each(["price", "contents", "deactivated"])("pre-payment offer change: %s pauses for review", async change => {
  const fixture = await createBasketFixture();
  await open(fixture, basketFor(fixture, { Milk: 2 }));
  const submitButton = page.getByRole("button", { name: "Place Order - £9.00", exact: true });
  await browserExpect(submitButton).toBeVisible();
  const update = change === "price" ? { packagePrice: 7 } : change === "contents" ? { items: [{ variant: fixture.variants.Milk.id, quantity: 3 }] } : { isActive: false };
  await Deal.updateOne({ _id: fixture.deals.A.id }, update);
  await submitButton.click();
  await browserExpect(page.getByText("Your offers have been updated. Review your basket total, then place your order.")).toBeVisible();
  expect(checkoutRequests).toHaveLength(0);
  expect(await Order.countDocuments()).toBe(0);
  const order = await submit(change === "price" ? 8 : 11);
  expect(order.total).toBe(change === "price" ? 8 : 11);
});

test("offline offer check blocks checkout and succeeds after reconnection", async () => {
  const fixture = await createBasketFixture();
  await open(fixture, basketFor(fixture, { Milk: 2 }));
  const button = page.getByRole("button", { name: "Place Order - £9.00", exact: true });
  await browserExpect(button).toBeVisible();
  blockOfferChecks = true;
  await button.click();
  await browserExpect(page.getByText("Could not check current offers. Please try again.")).toBeVisible();
  expect(checkoutRequests).toHaveLength(0);
  expect(await Order.countDocuments()).toBe(0);
  await browserExpect(button).toBeEnabled();
  blockOfferChecks = false;
  await submit(9);
});

test.each([500, 2000])("automatic savings combine with %i pence of account credit", async credit => {
  const fixture = await createBasketFixture({ credit });
  await open(fixture, basketFor(fixture, { Milk: 2 }));
  await browserExpect(page.getByRole("button", { name: "Place Order - £9.00", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: /Apply store credit/ }).check();
  const applied = Math.min(credit, 900);
  const order = await submit((900 - applied) / 100);
  expect(order.total).toBe(9);
  expect(order.creditApplied).toBe(applied);
  expect(order.discountAmount).toBe(2);
  if (applied === 900) {
    expect(order.status).toBe("paid");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect((await Customer.findById(fixture.customer.id)).creditBalance).toBe(credit - applied);
  } else expect(stripe.coupons.create).toHaveBeenCalledWith(expect.objectContaining({ amount_off: 200 + applied }));
});

test("stock lost after preview rejects checkout without an order or stranded reservations", async () => {
  const fixture = await createBasketFixture();
  await open(fixture, basketFor(fixture, { Milk: 2 }));
  await browserExpect(page.getByRole("button", { name: "Place Order - £9.00", exact: true })).toBeVisible();
  // Lose stock after the pre-payment quote has finished, immediately before POST.
  await page.route("**/api/portal/orders/checkout", async route => {
    await Variant.updateOne({ _id: fixture.variants.Milk.id }, { stockQuantity: 1 });
    await route.fallback();
  });
  const response = page.waitForResponse(response => new URL(response.url()).pathname === "/api/portal/orders/checkout");
  await page.getByRole("button", { name: "Place Order - £9.00", exact: true }).click();
  expect((await response).status()).toBe(400);
  expect(await Order.countDocuments()).toBe(0);
  expect((await Variant.findById(fixture.variants.Milk.id)).reservedQuantity).toBe(0);
  expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
});

test.each([390, 1440])("manual product additions, quantity edits and removal update savings on %ipx", async width => {
  const f = await createBasketFixture();
  await open(f, basketFor(f), { width });
  await page.goto(`${origin}/product/${f.products.Milk.id}?variant=${f.variants.Milk.id}`);
  await page.getByRole("button", { name: "Add to basket", exact: true }).click();
  const drawer = page.locator("div.fixed.right-0").filter({ has: page.getByRole("heading", { name: "Your Cart", exact: true }) });
  const subtotal = drawer.getByText("Subtotal", { exact: true }).locator("..");
  await browserExpect(subtotal).toContainText("£5.00");
  await drawer.getByRole("button", { name: "Increase quantity", exact: true }).click();
  await browserExpect(subtotal).toContainText("£8.00");
  await browserExpect(drawer.getByText("Deal savings applied automatically")).toBeVisible();
  await drawer.getByRole("button", { name: "Increase quantity", exact: true }).click();
  await browserExpect(subtotal).toContainText("£13.00");
  await drawer.getByRole("button", { name: "Decrease quantity", exact: true }).click();
  await drawer.getByRole("button", { name: "Decrease quantity", exact: true }).click();
  await browserExpect(subtotal).toContainText("£5.00");
  await browserExpect(drawer.getByText("Deal savings applied automatically")).toHaveCount(0);
  await drawer.getByRole("button", { name: "Remove item", exact: true }).click();
  await browserExpect(drawer.getByText("Your cart is empty")).toBeVisible();
  expect(await Order.countDocuments()).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("levants-dairy-cart")).items)).toEqual([]);
});

test("removing a mixed-package component removes only that offer", async () => {
  const f = await createBasketFixture();
  await open(f, basketFor(f, { Milk: 1, Honey: 1 }));
  await browserExpect(page.getByRole("button", { name: "Place Order - £7.00", exact: true })).toBeVisible();
  await page.goto(origin + "/shop");
  await page.getByRole("button", { name: "Cart", exact: true }).click();
  const drawer = page.locator("div.fixed.right-0").filter({ has: page.getByRole("heading", { name: "Your Cart", exact: true }) });
  const honey = drawer.locator("div.flex.gap-4.p-4").filter({ has: page.getByRole("heading", { name: "Honey", exact: true }) });
  await honey.getByRole("button", { name: "Remove item", exact: true }).click();
  await browserExpect(drawer.getByText("Deal savings applied automatically")).toHaveCount(0);
  await drawer.getByRole("link", { name: "Checkout Securely" }).click();
  expect((await submit(6)).metadata?.deals || []).toHaveLength(0);
});

test("reload preserves manual quantities and reapplies savings without persisting automatic duplicate packages", async () => {
  const f = await createBasketFixture();
  await open(f, basketFor(f, { Milk: 4 }));
  await browserExpect(page.getByRole("button", { name: "Place Order - £17.00", exact: true })).toBeVisible();
  await page.reload();
  await browserExpect(page.getByRole("button", { name: "Place Order - £17.00", exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("levants-dairy-cart")));
  expect(stored.items[0].quantity).toBe(4);
  expect(stored.deals).toEqual([]);
  const order = await submit(17);
  expect(order.items[0].quantity).toBe(4);
  expect(order.metadata.deals[0].quantity).toBe(2);
});
