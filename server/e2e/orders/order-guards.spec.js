"use strict";
const { test, expect } = require("@playwright/test");
const { API, fixture, state, loginApi, invariant } = require("./support/client");
let f;
test.beforeEach(async ({ request }) => { f = await fixture(request); });

const operations = [
  { name: "list", method: "get", permission: "read", path: () => "" },
  { name: "details", method: "get", permission: "read", path: f => `/${f.orders.importedUnpaid.id}` },
  { name: "status", method: "put", permission: "update", path: f => `/${f.orders.importedUnpaid.id}/status`, body: () => ({ deliveryStatus: "dispatched" }) },
  { name: "payment", method: "patch", permission: "payment", path: f => `/${f.orders.importedUnpaid.id}/payment`, body: () => ({ paid: true }) },
  { name: "items", method: "patch", permission: "update", path: f => `/${f.orders.importedUnpaid.id}/items`, body: f => ({ items: [{ variantId: f.variants.milk.id, quantity: 3 }] }) },
  { name: "driver note", method: "patch", permission: "update", path: f => `/${f.orders.importedUnpaid.id}/driver-note`, body: () => ({ driverNote: "changed" }) },
  { name: "refund", method: "post", permission: "refund", path: f => `/${f.orders.websitePaid.id}/refund`, body: () => ({ amount: 2 }) },
  { name: "delete", method: "delete", permission: "delete", path: f => `/${f.orders.importedUnpaid.id}` },
  { name: "bulk delete", method: "delete", permission: "delete", path: () => "/bulk", body: f => ({ orderIds: [f.orders.importedUnpaid.id] }) },
  { name: "bulk status", method: "put", permission: "update", path: () => "/bulk/delivery-status", body: f => ({ orderIds: [f.orders.importedUnpaid.id], deliveryStatus: "dispatched" }) },
  { name: "bulk delivery date", method: "patch", permission: "update", path: () => "/assign-delivery-date-bulk", body: f => ({ orderIds: [f.orders.importedUnpaid.id], deliveryDate: f.future }) },
];
const grants = { reader: ["read"], editor: ["read", "update", "payment"], payer: ["read", "payment"], refunder: ["read", "refund"], deleter: ["read", "delete"], none: [] };
test.describe("Orders API / Authentication and granular permissions", () => {
  for (const op of operations) test(`unauthenticated ${op.name} is rejected without mutation`, async ({ request }) => {
    const before = await state(request, f.orders.importedUnpaid.id);
    const response = await request[op.method](`${API}/admin/orders${op.path(f)}`, { data: op.body?.(f) }); expect(response.status()).toBe(401);
    expect(invariant(await state(request, f.orders.importedUnpaid.id))).toEqual(invariant(before));
  });
  for (const [role, permissions] of Object.entries(grants)) for (const op of operations.filter(op => !permissions.includes(op.permission))) test(`${role} cannot bypass ${op.name} permission with a direct request`, async ({ request }) => {
    await loginApi(request, f.users[role]); const id = op.name === "refund" ? f.orders.websitePaid.id : f.orders.importedUnpaid.id; const before = await state(request, id);
    const response = await request[op.method](`${API}/admin/orders${op.path(f)}`, { data: op.body?.(f) }); expect(response.status()).toBe(403);
    expect(invariant(await state(request, id))).toEqual(invariant(before));
  });
  test("customer tokens cannot access the admin order API or another customer's order", async ({ request }) => {
    const login = await request.post(`${API}/portal/auth/login`, { data: { email: f.customers[0].email, password: f.customers[0].password } }); expect(login.ok()).toBeTruthy();
    const token = (await login.json()).data.accessToken; const headers = { Authorization: `Bearer ${token}` };
    expect((await request.get(`${API}/portal/orders/${f.orders.websitePaid.id}`, { headers })).status()).toBe(200);
    expect([403, 404]).toContain((await request.get(`${API}/portal/orders/${f.orders.websiteUnpaid.id}`, { headers })).status());
    expect([401, 403]).toContain((await request.get(`${API}/admin/orders`, { headers })).status());
  });
});

const validation = [
  ["missing status", "put", "/status", {}], ["unknown status", "put", "/status", { deliveryStatus: "banana" }],
  ["overlong delivery note", "put", "/status", { deliveryStatus: "delivered", deliveryNote: "x".repeat(501) }],
  ["invalid proof URL", "put", "/status", { deliveryStatus: "delivered", deliveryProofUrl: "not-a-url" }],
  ["unknown status field", "put", "/status", { deliveryStatus: "ordered", total: 0 }],
  ["missing payment flag", "patch", "/payment", {}], ["negative payment amount", "patch", "/payment", { paid: true, amountPaid: -1 }],
  ["unknown payment field", "patch", "/payment", { paid: true, status: "paid" }],
  ["empty items", "patch", "/items", { items: [] }], ["zero quantity", "patch", "/items", f => ({ items: [{ variantId: f.variants.milk.id, quantity: 0 }] })],
  ["negative quantity", "patch", "/items", f => ({ items: [{ variantId: f.variants.milk.id, quantity: -1 }] })],
  ["fractional quantity", "patch", "/items", f => ({ items: [{ variantId: f.variants.milk.id, quantity: 1.5 }] })],
  ["invalid variant ID", "patch", "/items", { items: [{ variantId: "wrong", quantity: 1 }] }],
  ["inactive variant", "patch", "/items", f => ({ items: [{ variantId: f.variants.inactive.id, quantity: 1 }] })],
  ["missing variant", "patch", "/items", { items: [{ variantId: "111111111111111111111111", quantity: 1 }] }],
  ["forged item price", "patch", "/items", f => ({ items: [{ variantId: f.variants.milk.id, quantity: 1, price: 0 }] })],
  ["negative imported total", "patch", "/items", f => ({ items: [{ variantId: f.variants.milk.id, quantity: 1 }], importedBaseTotal: -1 })],
];
test.describe("Orders API / Invalid input never mutates financial or stock state", () => {
  for (const [name, method, suffix, body] of validation) test(name, async ({ request }) => {
    await loginApi(request, f.users.admin); const order = f.orders.importedUnpaid; const before = await state(request, order.id);
    const response = await request[method](`${API}/admin/orders/${order.id}${suffix}`, { data: typeof body === "function" ? body(f) : body }); expect(response.status()).toBe(400);
    expect(invariant(await state(request, order.id))).toEqual(invariant(before));
  });
  for (const [method, path, data] of [["put", "/bulk/delivery-status", { orderIds: [], deliveryStatus: "delivered" }], ["delete", "/bulk", { orderIds: ["bad-id"] }], ["patch", "/assign-delivery-date-bulk", f => ({ orderIds: [f.orders.importedPaid.id], deliveryDate: "not-a-date" })]]) test(`invalid bulk ${method} ${path} does not affect selected orders`, async ({ request }) => {
    await loginApi(request, f.users.admin); const before = await state(request, f.orders.importedPaid.id);
    expect((await request[method](`${API}/admin/orders${path}`, { data: typeof data === "function" ? data(f) : data })).status()).toBe(400);
    expect(invariant(await state(request, f.orders.importedPaid.id))).toEqual(invariant(before));
  });
  for (const key of ["websitePaid", "subscription", "refunded", "refundPending"]) test(`payment edit rejects protected ${key} orders`, async ({ request }) => {
    await loginApi(request, f.users.admin); const order = f.orders[key]; const before = await state(request, order.id);
    expect((await request.patch(`${API}/admin/orders/${order.id}/payment`, { data: { paid: false } })).status()).toBe(400);
    expect(invariant(await state(request, order.id))).toEqual(invariant(before));
  });
  test("generic subscription refund is rejected before any Stripe request", async ({ request }) => {
    await loginApi(request, f.users.admin); const order = f.orders.subscription; const before = await state(request, order.id);
    expect((await request.post(`${API}/admin/orders/${order.id}/refund`, { data: {} })).status()).toBe(409);
    expect(invariant(await state(request, order.id))).toEqual(invariant(before));
  });
  test("non-image proof and oversized proof are rejected without delivery changes", async ({ request }) => {
    await loginApi(request, f.users.admin); const order = f.orders.websitePaid; const before = await state(request, order.id);
    for (const file of [{ name: "proof.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") }, { name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(8 * 1024 * 1024 + 1) }]) {
      const response = await request.put(`${API}/admin/orders/${order.id}/status`, { multipart: { deliveryStatus: "delivered", deliveryProof: file } }); expect([400, 413]).toContain(response.status());
      expect(invariant(await state(request, order.id))).toEqual(invariant(before));
    }
  });
  test("driver cannot bypass a delivered-order lock through bulk update", async ({ request }) => {
    await loginApi(request, f.users.driver); const order = f.orders.delivered; const before = await state(request, order.id);
    const response = await request.put(`${API}/admin/orders/bulk/delivery-status`, { data: { orderIds: [order.id], deliveryStatus: "ordered" } });
    expect(response.status(), "The single-order delivered lock must also protect bulk mutations").toBe(403);
    expect(invariant(await state(request, order.id))).toEqual(invariant(before));
  });
});
