"use strict";
const { expect } = require("@playwright/test");
const API = "http://localhost:5001/api";
const CONTROL = "http://127.0.0.1:5013";
const headers = { "x-orders-test-token": "isolated-orders-test-control" };
async function data(response) { const json = await response.json(); expect(response.ok(), JSON.stringify(json)).toBeTruthy(); return json.data; }
async function fixture(request, options = {}) { return data(await request.post(`${CONTROL}/fixtures`, { headers, data: options })); }
async function state(request, id) { return data(await request.get(`${CONTROL}/state/${id}`, { headers })); }
async function control(request, path) { return data(await request.post(`${CONTROL}${path}`, { headers })); }
async function loginApi(request, credentials) { const response = await request.post(`${API}/auth/login`, { data: { email: credentials.email, password: credentials.password } }); await data(response); }
async function login(page, credentials) {
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(credentials.email); await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  const authenticated = page.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/login" && r.request().method() === "POST");
  await page.getByRole("button", { name: /Sign in/i, exact: true }).click();
  const response = await authenticated; const body = await response.json(); expect(response.status(), body.message || "Admin login must succeed").toBe(200);
  await page.waitForURL(url => url.pathname !== "/login");
  await page.goto("/orders"); await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();
}
function modal(page, title) { return page.getByRole("heading", { name: title, exact: true }).locator("..").locator(".."); }
function row(page, order) { return page.locator("table").first().getByRole("row").filter({ hasText: order.orderId }); }
async function open(page, order) { await row(page, order).click(); const detail = modal(page, `Order ${order.orderId}`); await expect(detail).toBeVisible(); return detail; }
async function responseFor(page, id, suffix, method, action) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === `/api/admin/orders/${id}${suffix}` && r.request().method() === method);
  await action(); return response;
}
function variantState(snapshot, id) { return snapshot.variants.find(v => v._id === id); }
function invariant(snapshot) { return { items: snapshot.order?.items, subtotal: snapshot.order?.subtotal, total: snapshot.order?.total, status: snapshot.order?.status, deliveryStatus: snapshot.order?.deliveryStatus, amountPaid: snapshot.order?.amountPaid, driverNote: snapshot.order?.driverNote, refunds: snapshot.order?.refunds, archived: snapshot.order?.archived, stock: snapshot.variants, remoteRefunds: snapshot.refunds }; }
module.exports = { API, CONTROL, fixture, state, control, loginApi, login, modal, row, open, responseFor, variantState, invariant };
