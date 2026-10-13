"use strict";

const { test, expect } = require("@playwright/test");
const { reset } = require("../support/e2e-client");
const { API_ORIGIN, CONTROL_ORIGIN, CONTROL_TOKEN } = require("../support/constants");
const ADMIN_ORIGIN = "http://127.0.0.1:4174";
const headers = { "x-e2e-control-token": CONTROL_TOKEN };
const address = { line1: "1 E2E Dairy Lane", city: "Bradford", postcode: "BD5 0AL", country: "UK" };

test.beforeEach(async ({ request }) => { await reset(request); });
test.afterAll(async ({ request }) => { await reset(request); });

async function fixture(page, request) {
  const response = await request.post(`${CONTROL_ORIGIN}/deal-fixtures`, { headers, data: { basketScenarios: true } });
  expect(response.ok(), await response.text()).toBeTruthy();
  const data = (await response.json()).data;
  const login = await page.request.post(`${API_ORIGIN}/api/auth/login`, { data: data.adminCredentials });
  expect(login.ok(), await login.text()).toBeTruthy();
  await page.goto(`${ADMIN_ORIGIN}/deals/new`);
  for (const key of ["MILK", "BUTTER"]) {
    await page.getByRole("row").filter({ hasText: data.variants[key].name })
      .getByRole("button", { name: "Add variant Standard", exact: true }).click();
  }
  await page.getByRole("button", { name: "Details & pricing", exact: true }).click();
  await page.getByLabel("Deal name *").fill("Milk and honey package");
  await page.getByLabel("Package price (£) *").fill("6");
  await page.getByRole("button", { name: "Review & publish", exact: true }).click();
  const published = page.waitForResponse(res => res.request().method() === "POST" && new URL(res.url()).pathname === "/api/admin/deals");
  await page.getByRole("button", { name: "Create product package" }).click();
  expect((await published).status()).toBe(201);
  await expect(page.getByRole("row").filter({ hasText: "Milk and honey package" })).toContainText("£6.00");
  const list = await page.request.get(`${API_ORIGIN}/api/admin/deals`, { params: { search: "Milk and honey package" } });
  const b = (await list.json()).data.deals[0];
  return { data, deals: { A: data.deal, B: b } };
}

function payload(data, deals, manual, claims, explicit = {}) {
  const quantities = {};
  for (const [key, quantity] of Object.entries(manual)) quantities[data.variants[key].id] = quantity;
  for (const [key, quantity] of Object.entries(explicit)) {
    const parts = key === "A" ? [["MILK", 2]] : [["MILK", 1], ["BUTTER", 1]];
    for (const [variant, count] of parts) {
      const id = data.variants[variant].id;
      quantities[id] = (quantities[id] || 0) + count * quantity;
    }
  }
  return {
    customerId: data.customerId,
    deliveryAddress: address,
    items: Object.entries(quantities).map(([variantId, quantity]) => ({ variantId, quantity })),
    deals: Object.entries(claims).map(([key, quantity]) => ({
      dealId: String(deals[key]._id || deals[key].id), quantity,
      expectedPackagePrice: key === "A" ? 8 : 6,
    })),
  };
}

test("admin-created packages are validated across the order basket matrix", async ({ page, request }) => {
  const { data, deals } = await fixture(page, request);
  const scenarios = [
    ["one milk", { MILK: 1 }, {}, {}, 5],
    ["two milk", { MILK: 2 }, { A: 1 }, {}, 8],
    ["three milk", { MILK: 3 }, { A: 1 }, {}, 13],
    ["four milk", { MILK: 4 }, { A: 2 }, {}, 16],
    ["milk and honey", { MILK: 1, BUTTER: 1 }, { B: 1 }, {}, 6],
    ["two milk and honey", { MILK: 2, BUTTER: 1 }, { B: 1 }, {}, 11],
    ["two milk and two honey", { MILK: 2, BUTTER: 2 }, { B: 2 }, {}, 12],
    ["three milk and honey", { MILK: 3, BUTTER: 1 }, { A: 1, B: 1 }, {}, 14],
    ["different milk variants", { MILK: 1, OTHER_MILK: 1 }, {}, {}, 10],
    ["incomplete mixed deal", { BUTTER: 1 }, {}, {}, 4],
    ["explicit A", {}, { A: 1 }, { A: 1 }, 8],
    ["explicit plus automatic A", { MILK: 2 }, { A: 2 }, { A: 1 }, 16],
    ["explicit A plus automatic B", { MILK: 1, BUTTER: 1 }, { A: 1, B: 1 }, { A: 1 }, 14],
    ["explicit A with retail honey", { BUTTER: 1 }, { A: 1 }, { A: 1 }, 12],
    ["two explicit packages", {}, { A: 1, B: 1 }, { A: 1, B: 1 }, 14],
    ["unrelated eggs", { EGGS: 1 }, { A: 1 }, { A: 1 }, 10],
  ];
  for (const [name, manual, claims, explicit, subtotal] of scenarios) {
    await test.step(name, async () => {
      const response = await request.post(`${API_ORIGIN}/api/orders`, { data: payload(data, deals, manual, claims, explicit) });
      expect(response.ok(), await response.text()).toBeTruthy();
      const orderId = (await response.json()).data.orderId;
      const stateResponse = await request.get(`${CONTROL_ORIGIN}/deal-state/${orderId}`, { headers });
      const order = (await stateResponse.json()).data.order;
      expect(order.subtotal - order.discountAmount).toBeCloseTo(subtotal, 2);
      expect(order.total).toBeCloseTo(subtotal + 1, 2);
      expect(Object.fromEntries((order.metadata?.deals || []).map(deal => [String(deal.dealId), deal.quantity]))).toEqual(
        Object.fromEntries(Object.entries(claims).map(([key, quantity]) => [String(deals[key]._id || deals[key].id), quantity])),
      );
    });
  }
});

test("admin price edit invalidates an old package claim", async ({ page, request }) => {
  const { data, deals } = await fixture(page, request);
  await page.goto(`${ADMIN_ORIGIN}/deals/${data.deal._id}/edit`);
  await page.getByRole("button", { name: "Details & pricing", exact: true }).click();
  await page.getByLabel("Package price (£) *").fill("7");
  await page.getByRole("button", { name: "Review & publish", exact: true }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Fresh milk package" })).toContainText("£7.00");
  const stale = await request.post(`${API_ORIGIN}/api/orders`, { data: payload(data, deals, { MILK: 2 }, { A: 1 }) });
  expect(stale.status()).toBe(400);
  const reviewed = payload(data, deals, { MILK: 2 }, { A: 1 });
  reviewed.deals[0].expectedPackagePrice = 7;
  const accepted = await request.post(`${API_ORIGIN}/api/orders`, { data: reviewed });
  expect(accepted.ok(), await accepted.text()).toBeTruthy();
});
