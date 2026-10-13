"use strict";
const { test, expect } = require("@playwright/test");
const { API, fixture, state, control, login, open, modal, responseFor, invariant, variantState } = require("./support/client");
let f;
test.beforeEach(async ({ request }) => { f = await fixture(request, { realPayment: true }); });

test.describe("Orders / Real Stripe test refunds", () => {
  test("browser partial refund updates local and Stripe totals; the remainder refunds once", async ({ page, request }) => {
    await login(page, f.users.refunder); const order = f.orders.websitePaid; const before = await state(request, order.id);
    await (await open(page, order)).getByRole("button", { name: "Refund", exact: true }).click(); let confirm = modal(page, "Confirm refund"); await confirm.getByLabel("Refund amount (optional)").fill("3");
    expect((await responseFor(page, order.id, "/refund", "POST", () => confirm.getByRole("button", { name: "Refund", exact: true }).click())).status()).toBe(200);
    await expect.poll(async () => (await state(request, order.id)).order.status).toBe("partially_refunded"); let after = await state(request, order.id);
    expect(after.refunds.reduce((n, r) => n + r.amount, 0)).toBe(300); expect(after.variants).toEqual(before.variants);
    await page.reload(); await (await open(page, order)).getByRole("button", { name: "Refund", exact: true }).click(); confirm = modal(page, "Confirm refund");
    expect((await responseFor(page, order.id, "/refund", "POST", () => confirm.getByRole("button", { name: "Refund", exact: true }).click())).status()).toBe(200);
    await expect.poll(async () => (await state(request, order.id)).order.status).toBe("refunded"); after = await state(request, order.id); expect(after.refunds.reduce((n, r) => n + r.amount, 0)).toBe(1000); expect(after.refunds).toHaveLength(2);
    expect((await page.request.post(`${API}/admin/orders/${order.id}/refund`, { data: {} })).status()).toBe(409); expect((await state(request, order.id)).refunds).toHaveLength(2);
  });
  test("cancelling refund confirmation causes no financial or stock changes", async ({ page, request }) => {
    await login(page, f.users.admin); const order = f.orders.websitePaid; const before = await state(request, order.id);
    await (await open(page, order)).getByRole("button", { name: "Refund", exact: true }).click(); await modal(page, "Confirm refund").getByRole("button", { name: "Cancel", exact: true }).click();
    expect(invariant(await state(request, order.id))).toEqual(invariant(before));
  });
  for (const amount of ["0", "-1"]) test(`browser invalid refund amount ${amount} must not become a full refund`, async ({ page, request }) => {
    await login(page, f.users.admin); const order = f.orders.websitePaid; const before = await state(request, order.id);
    await (await open(page, order)).getByRole("button", { name: "Refund", exact: true }).click(); const confirm = modal(page, "Confirm refund"); await confirm.getByLabel("Refund amount (optional)").fill(amount);
    // A disabled button or an explicit server rejection are both valid guards.
    const button = confirm.getByRole("button", { name: "Refund", exact: true });
    if (await button.isEnabled()) {
      const response = await responseFor(page, order.id, "/refund", "POST", () => button.click()); expect(response.status()).toBe(400);
    }
    expect(invariant(await state(request, order.id))).toEqual(invariant(before));
  });
  test("refund above the captured amount and partial refund with restock are rejected", async ({ page, request }) => {
    await login(page, f.users.admin); const order = f.orders.websitePaid; const before = await state(request, order.id);
    for (const data of [{ amount: 11 }, { amount: 3, restock: true }, { amount: 0 }, { amount: -1 }]) expect((await page.request.post(`${API}/admin/orders/${order.id}/refund`, { data })).status()).toBe(400);
    expect(invariant(await state(request, order.id))).toEqual(invariant(before));
  });
  test("full refund restocks once even when a signed succeeded webhook is replayed", async ({ page, request }) => {
    await login(page, f.users.admin); const order = f.orders.websitePaid;
    expect((await page.request.post(`${API}/admin/orders/${order.id}/refund`, { data: { restock: true } })).status()).toBe(200);
    await expect.poll(async () => (await state(request, order.id)).order.status).toBe("refunded");
    const beforeReplay = await state(request, order.id); expect(variantState(beforeReplay, f.variants.milk.id).stockQuantity).toBe(102);
    const replay = await control(request, `/refund-replay/${order.id}`); expect(replay.status).toBe(200);
    const afterReplay = await state(request, order.id); expect(afterReplay.variants).toEqual(beforeReplay.variants); expect(afterReplay.order.refunds).toHaveLength(1); expect(afterReplay.refunds).toHaveLength(1);
  });
  test("rapid browser confirmation cannot issue two refund requests", async ({ page, request }) => {
    await login(page, f.users.admin); const order = f.orders.websitePaid; await (await open(page, order)).getByRole("button", { name: "Refund", exact: true }).click();
    const confirm = modal(page, "Confirm refund"); let release; const held = new Promise(resolve => { release = resolve; }); let count = 0;
    await page.route(`**/api/admin/orders/${order.id}/refund`, async route => { count++; await held; await route.continue(); });
    await confirm.getByRole("button", { name: "Refund", exact: true }).click(); await expect(confirm.getByRole("button", { name: /Refund/i }).last()).toBeDisabled();
    await expect.poll(() => count).toBe(1); release(); await expect.poll(async () => (await state(request, order.id)).order.status).toBe("refunded"); expect(count).toBe(1); expect((await state(request, order.id)).refunds).toHaveLength(1);
  });
});
