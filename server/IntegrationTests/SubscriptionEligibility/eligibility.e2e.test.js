const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const { chromium, expect: ui } = require("@playwright/test");
const app = require("../../Tests/Deals/helpers/testApp");
const Product = require("../../models/product.model");
const Subscription = require("../../models/subscription.model");
const Order = require("../../models/order.model");
const jwt = require("../../utils/jwt.util");
const stripe = require("../../utils/stripe.util");
const { createUser } = require("../../Tests/helpers/authTestData");
const { createBasketFixture } = require("../Deals/basketFixtures.cjs");

jest.setTimeout(90000);
let browser, adminServer, customerServer, adminOrigin, customerOrigin;
let adminContext, customerContext, page;
async function serve(dist) {
  if (!dist || !fs.existsSync(path.join(dist, "index.html"))) throw Error("Build both clients before browser tests");
  const site = express();
  site.use((req, res, next) => req.path.startsWith("/api/") ? app(req, res, next) : next());
  site.use(express.static(dist));
  site.use((req, res) => res.sendFile(path.join(dist, "index.html")));
  const server = await new Promise(resolve => { const server = site.listen(0, "127.0.0.1", () => resolve(server)); });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
beforeAll(async () => {
  ({ server: adminServer, origin: adminOrigin } = await serve(process.env.ELIGIBILITY_ADMIN_DIST));
  ({ server: customerServer, origin: customerOrigin } = await serve(process.env.ELIGIBILITY_CLIENT_DIST));
  browser = await chromium.launch();
});
afterEach(async () => {
  if (page && !page.isClosed()) {
    fs.mkdirSync("eligibility-integration-artifacts", { recursive: true });
    await page.screenshot({ path: `eligibility-integration-artifacts/${expect.getState().currentTestName.replace(/[^a-z0-9]/gi, "-")}.png`, fullPage: true });
  }
  await adminContext?.close(); await customerContext?.close();
  adminContext = customerContext = page = null;
});
afterAll(async () => {
  await browser?.close();
  for (const server of [adminServer, customerServer]) if (server) {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
async function allowTestImages(context) {
  await context.route("https://cdn.test.com/**", route => route.fulfill({
    contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>',
  }));
  await context.route("https://admin.litwebs.co.uk/**", route => route.fulfill({
    headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "Content-Type" }, json: { data: { status: "live" } },
  }));
}
for (const width of [1440, 390]) {
  test(`admin eligibility changes control customer recurring selectors without affecting ordinary sales at ${width}px`, async () => {
    const fixture = await createBasketFixture();
    fixture.customer.stripeCustomerId = "cus_eligibility";
    await fixture.customer.save();
    stripe.customers.retrieve.mockResolvedValue({ id: "cus_eligibility", invoice_settings: { default_payment_method: "pm_test" } });
    const admin = await createUser({ role: "admin" });
    adminContext = await browser.newContext({ viewport: { width, height: 1000 } });
    await allowTestImages(adminContext);
    await adminContext.addInitScript(() => localStorage.setItem("levants.authHint", "1"));
    process.env.FRONTEND_URL_DEV = adminOrigin;
    const auth = await adminContext.request.post(adminOrigin + "/api/auth/login", {
      data: { email: admin.email, password: "secret123" },
    });
    expect(auth.status()).toBe(200);
    const adminPage = await adminContext.newPage();
    await adminPage.goto(adminOrigin + `/products/${fixture.products.Honey.id}/edit`);
    await ui(adminPage.getByLabel("Subscription Eligible")).toHaveValue("eligible");
    await adminPage.getByLabel("Subscription Eligible").selectOption("ineligible");
    await adminPage.getByRole("button", { name: "Save changes", exact: true }).first().click();
    await ui(adminPage).toHaveURL(adminOrigin + "/products");
    expect((await Product.findById(fixture.products.Honey.id)).isSubscriptionEligible).toBe(false);
    await adminPage.goto(adminOrigin + `/products/${fixture.products.Honey.id}/edit`);
    await ui(adminPage.getByLabel("Subscription Eligible")).toHaveValue("ineligible");

    customerContext = await browser.newContext({ viewport: { width, height: 1000 } });
    await allowTestImages(customerContext);
    await customerContext.addCookies([{ name: "customerAccessToken", value: jwt.signCustomerAccessToken(fixture.customer), url: customerOrigin }]);
    await customerContext.addInitScript(() => localStorage.setItem("portal-authenticated", "true"));
    page = await customerContext.newPage();
    page.on("pageerror", error => console.warn("Eligibility browser error:", error.message));
    await page.goto(customerOrigin + "/shop");
    await ui(page.getByRole("heading", { name: /^Honey(?: - .*)?$/ }).first()).toBeVisible();

    // Ineligible products are excluded from recurring catalogues.
    const recurring = await customerContext.request.get(customerOrigin + "/api/products?subscriptionEligible=true");
    expect((await recurring.json()).data.items.some(p => p.id === fixture.products.Honey.id)).toBe(false);
    const forbidden = await customerContext.request.post(customerOrigin + "/api/portal/subscriptions", {
      data: { operationId: require("node:crypto").randomUUID(), frequency: "weekly", preferredDeliveryDay: 0,
        deliveryAddressId: String(fixture.customer.addresses[0]._id),
        items: [{ variantId: fixture.variants.Honey.id, quantity: 1 }] },
    });
    expect(forbidden.status()).toBe(400);
    expect((await forbidden.json()).message).toMatch(/not eligible/i);

    await page.goto(customerOrigin + "/portal/subscriptions/new");
    const next = page.getByRole("button", { name: "Next", exact: true });
    await ui(next).toBeEnabled();
    await next.click();
    await ui(page.getByText("How often would you like delivery?", { exact: true })).toBeVisible();
    await next.click();
    await ui(page.getByRole("heading", { name: /^Milk(?: - .*)?$/ }).first()).toBeVisible();
    await ui(page.getByRole("heading", { name: /^Honey(?: - .*)?$/ })).toHaveCount(0);

    const sub = await Subscription.create({
      subscriptionNumber: `SUB-ELIGIBILITY-${width}`, customer: fixture.customer._id,
      frequency: "weekly", preferredDeliveryDay: 0, preferredDeliveryDays: [0], status: "active",
      startDate: new Date(), nextDeliveryDate: new Date(Date.now() + 14 * 86400000),
      deliveryAddress: fixture.customer.addresses[0].toObject(),
      items: [{ product: fixture.products.Milk._id, variant: fixture.variants.Milk._id, name: "Milk Standard",
        sku: fixture.variants.Milk.sku, quantity: 1, unitPrice: 5 }],
    });
    await page.goto(customerOrigin + `/portal/subscriptions/${sub.id}/add-products`);
    await ui(page.getByRole("heading", { name: "Select Products", exact: true })).toBeVisible();
    await ui(page.getByRole("heading", { name: /^Juice(?: - .*)?$/ }).first()).toBeVisible();
    await ui(page.getByRole("heading", { name: /^Honey(?: - .*)?$/ })).toHaveCount(0);
    const deniedAdd = await customerContext.request.post(customerOrigin + `/api/portal/subscriptions/${sub.id}/items`, {
      data: { variantId: fixture.variants.Honey.id, quantity: 1 },
    });
    expect(deniedAdd.status()).toBe(400);
    expect((await deniedAdd.json()).message).toMatch(/not subscription eligible/i);

    // An ordinary purchase of the excluded product still reaches checkout.
    const ordinary = await customerContext.request.post(customerOrigin + "/api/portal/orders/checkout", {
      data: { items: [{ variantId: fixture.variants.Honey.id, quantity: 1 }],
        deliveryAddress: { line1: "1 Test Street", city: "Bradford", postcode: "BD1 1AA", country: "GB" } },
    });
    expect(ordinary.status()).toBe(200);
    const order = await Order.findById((await ordinary.json()).data.orderId);
    expect(order.items.some(item => String(item.variant) === fixture.variants.Honey.id)).toBe(true);

    // Flag changes do not remove established products.
    const before = (await Subscription.findById(sub.id)).toObject();
    const changed = await adminContext.request.put(adminOrigin + `/api/admin/products/${fixture.products.Milk.id}`, {
      data: { isSubscriptionEligible: false },
    });
    expect(changed.status()).toBe(200);
    expect((await Subscription.findById(sub.id)).toObject()).toEqual(before);
    await page.goto(customerOrigin + `/portal/subscriptions/${sub.id}`);
    await ui(page.getByText("Milk Standard", { exact: true }).first()).toBeVisible();

    // Re-enabling is reflected on the next catalogue request.
    await adminPage.getByLabel("Subscription Eligible").selectOption("eligible");
    await adminPage.getByRole("button", { name: "Save changes", exact: true }).first().click();
    await ui(adminPage).toHaveURL(adminOrigin + "/products");
    await page.goto(customerOrigin + `/portal/subscriptions/${sub.id}/add-products`);
    await ui(page.getByRole("heading", { name: /^Honey(?: - .*)?$/ }).first()).toBeVisible();
  });
}
