"use strict";
const { test, expect } = require("@playwright/test");
const { API, fixture, state, loginApi, login, row, modal, open, invariant } = require("./support/client");
let f;
test.beforeEach(async ({ request }) => { f = await fixture(request); });

test.describe("Orders API / Archived, missing and terminal orders", () => {
  for (const [method, suffix, body] of [
    ["put", "/status", { deliveryStatus: "delivered" }], ["patch", "/payment", { paid: true }],
    ["patch", "/items", f => ({ items: [{ variantId: f.variants.milk.id, quantity: 3 }] })],
    ["patch", "/driver-note", { driverNote: "must not be saved" }], ["delete", "", undefined],
  ]) test(`archived order rejects ${method} ${suffix || "delete"}`, async ({ request }) => {
    await loginApi(request, f.users.admin); const order = f.orders.archived; const before = await state(request, order.id);
    const response = await request[method](`${API}/admin/orders/${order.id}${suffix}`, { data: typeof body === "function" ? body(f) : body });
    expect(response.status()).toBe(404); expect(invariant(await state(request, order.id))).toEqual(invariant(before));
  });
  for (const [method, path, payload] of [
    ["put", "/bulk/delivery-status", f => ({ orderIds: [f.orders.archived.id], deliveryStatus: "delivered" })],
    ["patch", "/assign-delivery-date-bulk", f => ({ orderIds: [f.orders.archived.id], deliveryDate: new Date(Date.parse(f.future) + 86400000).toISOString() })],
  ]) test(`bulk ${path} does not mutate archived orders`, async ({ request }) => {
    await loginApi(request, f.users.admin); const before = await state(request, f.orders.archived.id);
    await request[method](`${API}/admin/orders${path}`, { data: payload(f) });
    const after = await state(request, f.orders.archived.id); expect(after.order).toEqual(before.order); expect(after.variants).toEqual(before.variants); expect(after.emails).toEqual(before.emails);
  });
  test("missing order returns not found rather than mutating another order", async ({ request }) => {
    await loginApi(request, f.users.admin); const before = await state(request, f.orders.websitePaid.id);
    for (const [method, suffix, payload] of [["get", ""], ["put", "/status", { deliveryStatus: "delivered" }], ["patch", "/items", { items: [{ variantId: f.variants.milk.id, quantity: 1 }] }], ["delete", ""]]) {
      expect((await request[method](`${API}/admin/orders/111111111111111111111111${suffix}`, { data: payload })).status()).toBe(404);
    }
    expect(invariant(await state(request, f.orders.websitePaid.id))).toEqual(invariant(before));
  });
  test("driver note rejects overlong input without saving it", async ({ request }) => {
    await loginApi(request, f.users.admin); const order = f.orders.websitePaid; const before = await state(request, order.id);
    expect((await request.patch(`${API}/admin/orders/${order.id}/driver-note`, { data: { driverNote: "x".repeat(501) } })).status()).toBe(400);
    expect(invariant(await state(request, order.id))).toEqual(invariant(before));
  });
  test("bulk delivered sends each selected customer one email and no repeat emails", async ({ request }) => {
    await loginApi(request, f.users.admin); const ids = [f.orders.websitePaid.id, f.orders.importedPaid.id];
    for (let i = 0; i < 2; i++) expect((await request.put(`${API}/admin/orders/bulk/delivery-status`, { data: { orderIds: ids, deliveryStatus: "delivered" } })).status()).toBe(200);
    const snapshot = await state(request, ids[0]); expect(snapshot.emails.filter(e => e.template === "deliveryProof")).toHaveLength(2); expect(snapshot.order.status).toBe("paid");
  });
});

