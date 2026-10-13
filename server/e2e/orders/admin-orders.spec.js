"use strict";
const { test, expect } = require("@playwright/test");
const { API, fixture, state, control, login, modal, row, open, responseFor, variantState, invariant } = require("./support/client");

let f;
test.beforeEach(async ({ request }) => { f = await fixture(request); });

test.describe("Orders / Listing, details and filters", () => {
  test("lists active orders and displays the stored customer, address, items and totals", async ({ page }) => {
    await login(page, f.users.admin);
    await expect(row(page, f.orders.archived)).toHaveCount(0);
    const detail = await open(page, f.orders.importedPaid);
    await expect(detail.getByText("Alice Orders", { exact: true })).toBeVisible();
    await expect(detail.getByText("1 Orders Test Lane", { exact: false })).toBeVisible();
    await expect(detail.getByText("Orders E2E milk", { exact: true })).toBeVisible();
    await expect(detail.getByText("£11.00", { exact: true })).toBeVisible();
    await expect(detail.getByText("Leave in the porch", { exact: true })).toBeVisible();
  });
  for (const [name, query, key] of [["order reference", "ORD-E2E-005", "websiteUnpaid"], ["customer name", "Bob", "websiteUnpaid"], ["customer email", "bob@orders-e2e.example.invalid", "websiteUnpaid"]]) {
    test(`searches by ${name} through the real API`, async ({ page }) => {
      await login(page, f.users.admin); await page.getByPlaceholder("Search orders...").fill(query);
      await expect(page.locator("table").first().locator("tbody tr")).toHaveCount(1);
      await expect(row(page, f.orders[key])).toBeVisible();
    });
  }
  test("empty search shows an empty state and clearing filters restores results", async ({ page }) => {
    await login(page, f.users.admin); await page.getByPlaceholder("Search orders...").fill("NO-SUCH-ORDER-E2E");
    await expect(page.getByText("No orders found.")).toBeVisible(); await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByRole("button", { name: "Clear Filters", exact: true }).click(); await expect(row(page, f.orders.importedPaid)).toBeVisible();
  });
  for (const [label, value, key, excluded] of [
    ["Delivery Status", "delivered", "delivered", "websitePaid"], ["Payment Status", "unpaid", "websiteUnpaid", "websitePaid"],
    ["Order Source", "imported", "importedPaid", "websitePaid"], ["Order Source", "subscription", "subscription", "websitePaid"],
  ]) test(`filters ${label}: ${value}`, async ({ page }) => {
    await login(page, f.users.admin); await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.locator("label").filter({ hasText: new RegExp(`^${label}$`) }).locator("..").locator("select").selectOption(value);
    await expect(row(page, f.orders[key])).toBeVisible(); await expect(row(page, f.orders[excluded])).toHaveCount(0);
  });
  test("sorting by total changes order without changing stored data", async ({ page, request }) => {
    await login(page, f.users.admin); const before = await state(request, f.orders.importedPaid.id);
    await page.locator("select").filter({ has: page.locator('option[value="total-high"]') }).selectOption("total-high");
    await expect(page.locator("table").first().locator("tbody tr").first().locator('[data-label="Total"]')).toContainText("£11.00");
    expect(invariant(await state(request, f.orders.importedPaid.id))).toEqual(invariant(before));
  });
  test("pagination retrieves the next page and changing page size retains every active order", async ({ page, request }) => {
    f = await fixture(request, { pagination: true }); await login(page, f.users.admin);
    await expect(page.locator("table").first().locator("tbody tr")).toHaveCount(50);
    const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/admin/orders" && new URL(r.url()).searchParams.get("page") === "2");
    await page.getByRole("button", { name: /next/i }).click(); expect((await response).ok()).toBeTruthy();
    await expect(page.locator("table").first().locator("tbody tr")).toHaveCount(16);
    await page.locator("select").filter({ has: page.locator('option[value="100"]') }).selectOption("100");
    await expect(page.locator("table").first().locator("tbody tr")).toHaveCount(66);
  });
});

test.describe("Orders / Delivery status, notes and proof", () => {
  for (const target of ["dispatched", "in_transit", "delivered", "returned"]) test(`admin marks an order ${target} without changing payment or stock`, async ({ page, request }) => {
    await login(page, f.users.admin); const order = f.orders.websitePaid; const before = await state(request, order.id);
    const detail = await open(page, order); await detail.getByRole("button", { name: "Update Status", exact: true }).click();
    const status = modal(page, "Update Order Status"); await status.getByRole("button", { name: target.replace(/_/g, " "), exact: true }).click();
    const response = await responseFor(page, order.id, "/status", "PUT", () => status.getByRole("button", { name: `Mark as ${target.replace(/_/g, " ")}`, exact: true }).click());
    expect(response.status()).toBe(200); const after = await state(request, order.id);
    expect(after.order.deliveryStatus).toBe(target); expect(after.order.status).toBe(before.order.status); expect(after.variants).toEqual(before.variants); expect(after.order.total).toBe(before.order.total);
    if (target === "delivered") { expect(after.order.metadata.deliveredAt).toBeTruthy(); expect(after.emails.filter(e => /deliveryProof/i.test(e.template))).toHaveLength(1); }
    await page.reload(); await expect(row(page, order).locator('[data-label="Delivery Status"]')).toContainText(target.replace(/_/g, " "));
  });
  test("current status cannot be submitted and closing the modal performs no mutation", async ({ page, request }) => {
    await login(page, f.users.admin); const before = await state(request, f.orders.websitePaid.id);
    await (await open(page, f.orders.websitePaid)).getByRole("button", { name: "Update Status", exact: true }).click();
    const status = modal(page, "Update Order Status"); await expect(status.getByRole("button", { name: "ordered", exact: true })).toBeDisabled();
    await expect(status.getByRole("button", { name: "Select a status to continue" })).toBeDisabled(); await status.getByRole("button", { name: "Close modal" }).click();
    expect(invariant(await state(request, f.orders.websitePaid.id))).toEqual(invariant(before));
  });
  test("saves and clears a driver note without changing customer instructions", async ({ page, request }) => {
    await login(page, f.users.admin); const order = f.orders.websitePaid;
    let detail = await open(page, order); await detail.getByRole("button", { name: "Add note", exact: true }).click();
    await detail.getByPlaceholder("Note for the driver (visible on delivery run)…").fill("Ring twice; gate is open");
    expect((await responseFor(page, order.id, "/driver-note", "PATCH", () => detail.getByRole("button", { name: "Save", exact: true }).click())).status()).toBe(200);
    let snapshot = await state(request, order.id); expect(snapshot.order.driverNote).toBe("Ring twice; gate is open"); expect(snapshot.order.customerInstructions).toBe("Leave in the porch");
    await page.reload(); detail = await open(page, order); await detail.getByRole("button", { name: "Edit", exact: true }).click();
    await detail.getByPlaceholder("Note for the driver (visible on delivery run)…").fill("");
    expect((await responseFor(page, order.id, "/driver-note", "PATCH", () => detail.getByRole("button", { name: "Save", exact: true }).click())).status()).toBe(200);
    snapshot = await state(request, order.id); expect(snapshot.order.driverNote == null || snapshot.order.driverNote === "").toBeTruthy();
  });
  test("uploads proof and sends one delivery email; repeating delivered does not send another", async ({ page, request }) => {
    await login(page, f.users.admin); const order = f.orders.websitePaid;
    await (await open(page, order)).getByRole("button", { name: "Update Status", exact: true }).click();
    const status = modal(page, "Update Order Status"); await status.getByRole("button", { name: "delivered", exact: true }).click();
    await status.locator('input[type="file"]').last().setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2G0qQAAAAASUVORK5CYII=", "base64") });
    await status.getByPlaceholder(/Add a note for the customer/).fill("Left safely in porch");
    expect((await responseFor(page, order.id, "/status", "PUT", () => status.getByRole("button", { name: "Mark as delivered", exact: true }).click())).status()).toBe(200);
    let snapshot = await state(request, order.id); expect(snapshot.order.metadata.deliveryProofUrl).toMatch(/^https:\/\/orders-storage\.example\.invalid\//); expect(snapshot.order.metadata.deliveryNote).toBe("Left safely in porch"); expect(snapshot.uploads).toHaveLength(1);
    expect(snapshot.files.some(file => file.url === snapshot.order.metadata.deliveryProofUrl)).toBeTruthy();
    const repeated = await page.request.put(`${API}/admin/orders/${order.id}/status`, { data: { deliveryStatus: "delivered" } }); expect(repeated.status()).toBe(200);
    snapshot = await state(request, order.id); expect(snapshot.emails.filter(e => /deliveryProof/i.test(e.template))).toHaveLength(1);
  });
  test("storage failure leaves status, metadata and stock unchanged", async ({ page, request }) => {
    await login(page, f.users.admin); const order = f.orders.websitePaid; const before = await state(request, order.id); await control(request, "/storage-failure");
    const response = await page.request.put(`${API}/admin/orders/${order.id}/status`, { multipart: { deliveryStatus: "delivered", deliveryProof: { name: "proof.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2G0qQAAAAASUVORK5CYII=", "base64") } } });
    expect(response.status()).toBe(500); const after = await state(request, order.id); expect(invariant(after)).toEqual(invariant(before)); expect(after.order.metadata).toEqual(before.order.metadata);
  });
  test("a delivered driver order is locked in the UI and direct status endpoint", async ({ page, request }) => {
    await login(page, f.users.driver); const order = f.orders.delivered; const before = await state(request, order.id);
    await (await open(page, order)).getByRole("button", { name: "Update Status", exact: true }).click();
    const status = modal(page, "Update Order Status"); await expect(status.getByText("Delivered orders are locked and can’t be changed.")).toBeVisible();
    for (const option of ["ordered", "delivered", "returned"]) await expect(status.getByRole("button", { name: option, exact: true })).toBeDisabled();
    expect((await page.request.put(`${API}/admin/orders/${order.id}/status`, { data: { deliveryStatus: "ordered" } })).status()).toBe(403);
    expect(invariant(await state(request, order.id))).toEqual(invariant(before));
  });
});

test.describe("Orders / Imported item and payment editing", () => {
  test("quantity edit recalculates totals, persists after reload and leaves stock unchanged", async ({ page, request }) => {
    await login(page, f.users.editor); const order = f.orders.importedUnpaid; const before = await state(request, order.id);
    const detail = await open(page, order); await detail.getByRole("button", { name: "Edit items", exact: true }).click();
    await detail.locator('table input[type="number"]').first().fill("3");
    expect((await responseFor(page, order.id, "/items", "PATCH", () => detail.getByRole("button", { name: "Save items", exact: true }).click())).status()).toBe(200);
    const after = await state(request, order.id); expect(after.order.items[0].quantity).toBe(3); expect(after.order.subtotal).toBe(15); expect(after.order.total).toBe(16); expect(after.variants).toEqual(before.variants);
    await page.reload(); await expect((await open(page, order)).getByText("£16.00", { exact: true })).toBeVisible();
  });
  test("can exclude the delivery fee without changing the original address", async ({ page, request }) => {
    await login(page, f.users.admin); const order = f.orders.importedUnpaid; const before = await state(request, order.id);
    const detail = await open(page, order); await detail.getByRole("button", { name: "Edit items", exact: true }).click(); await detail.getByLabel("Include delivery fee in imported total").uncheck();
    expect((await responseFor(page, order.id, "/items", "PATCH", () => detail.getByRole("button", { name: "Save items", exact: true }).click())).status()).toBe(200);
    const after = await state(request, order.id); expect(after.order.total).toBe(10); expect(after.order.metadata.includeDeliveryFeeInTotal).toBe(false); expect(after.order.deliveryAddress).toEqual(before.order.deliveryAddress);
  });
  test("cancelled item edit and last-item removal guard preserve the order", async ({ page, request }) => {
    await login(page, f.users.admin); const before = await state(request, f.orders.importedUnpaid.id); const detail = await open(page, f.orders.importedUnpaid);
    await detail.getByRole("button", { name: "Edit items", exact: true }).click(); await expect(detail.getByRole("button", { name: "Remove", exact: true })).toBeDisabled();
    await detail.locator('table input[type="number"]').fill("4"); await detail.getByRole("button", { name: "Cancel edit", exact: true }).click();
    expect(invariant(await state(request, f.orders.importedUnpaid.id))).toEqual(invariant(before));
  });
  test("website order editing and subscription generic refunds are disabled in the browser", async ({ page }) => {
    await login(page, f.users.admin); let detail = await open(page, f.orders.websitePaid); await expect(detail.getByRole("button", { name: "Edit items", exact: true })).toBeDisabled(); await expect(detail.getByRole("button", { name: "Mark Unpaid", exact: true })).toBeDisabled();
    await detail.getByRole("button", { name: "Close modal" }).click(); detail = await open(page, f.orders.subscription); await expect(detail.getByRole("button", { name: "Refund", exact: true })).toBeDisabled(); await expect(detail.getByText(/Use subscription cancellation/)).toBeVisible();
  });
  for (const [mode, expected, amount] of [["full", "paid", 11], ["partial", "partially_paid", 3]]) test(`payment-only staff records ${mode} payment through the browser`, async ({ page, request }) => {
    await login(page, f.users.payer); const order = f.orders.importedUnpaid; const before = await state(request, order.id);
    await (await open(page, order)).getByRole("button", { name: "Mark Paid", exact: true }).click(); const payment = modal(page, "Mark as paid");
    if (mode === "partial") { await payment.getByRole("button", { name: "Custom amount", exact: true }).click(); await payment.locator('input[type="number"]').fill("3"); await expect(payment.getByText("Partially paid — £8.00 outstanding")).toBeVisible(); }
    expect((await responseFor(page, order.id, "/payment", "PATCH", () => payment.getByRole("button", { name: "Confirm", exact: true }).click())).status()).toBe(200);
    const after = await state(request, order.id); expect(after.order.status).toBe(expected); expect(after.order.amountPaid).toBe(amount); expect(after.variants).toEqual(before.variants); expect(after.refunds).toEqual([]);
  });
  test("marking an imported order unpaid clears payment evidence without changing delivery", async ({ page, request }) => {
    await login(page, f.users.admin); const order = f.orders.importedPaid; await (await open(page, order)).getByRole("button", { name: "Mark Unpaid", exact: true }).click();
    const payment = modal(page, "Mark as unpaid"); expect((await responseFor(page, order.id, "/payment", "PATCH", () => payment.getByRole("button", { name: "Confirm", exact: true }).click())).status()).toBe(200);
    const after = await state(request, order.id); expect(after.order.status).toBe("unpaid"); expect(after.order.amountPaid).toBeUndefined(); expect(after.order.paidAt).toBeUndefined(); expect(after.order.deliveryStatus).toBe("ordered");
  });
  test("network failure while saving items does not silently persist a change", async ({ page, request }) => {
    await login(page, f.users.admin); const order = f.orders.importedUnpaid; const before = await state(request, order.id); const detail = await open(page, order);
    await detail.getByRole("button", { name: "Edit items", exact: true }).click(); await detail.locator('table input[type="number"]').fill("7");
    await page.route(`**/api/admin/orders/${order.id}/items`, route => route.abort("failed")); await detail.getByRole("button", { name: "Save items", exact: true }).click();
    await expect(detail.getByRole("button", { name: "Save items", exact: true })).toBeEnabled(); expect(invariant(await state(request, order.id))).toEqual(invariant(before));
  });
});

test.describe("Orders / Bulk actions and deletion", () => {
  test("bulk delivery updates only selected orders and persists their dates", async ({ page, request }) => {
    await login(page, f.users.admin); for (const order of [f.orders.websitePaid, f.orders.importedPaid]) await row(page, order).getByRole("checkbox").check();
    await page.getByLabel("Delivery status", { exact: true }).selectOption("dispatched");
    const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/admin/orders/bulk/delivery-status" && r.request().method() === "PUT"); await page.getByRole("button", { name: "Update status", exact: true }).click(); expect((await response).status()).toBe(200);
    for (const order of [f.orders.websitePaid, f.orders.importedPaid]) expect((await state(request, order.id)).order.deliveryStatus).toBe("dispatched"); expect((await state(request, f.orders.websiteUnpaid.id)).order.deliveryStatus).toBe("ordered");
    await page.reload();
    for (const order of [f.orders.websitePaid, f.orders.importedPaid]) await row(page, order).getByRole("checkbox").check();
    const future = new Date(f.future); future.setUTCDate(future.getUTCDate() + 2); await page.getByLabel("Delivery date", { exact: true }).fill(future.toISOString().slice(0, 10));
    const dateResponse = page.waitForResponse(r => new URL(r.url()).pathname === "/api/admin/orders/assign-delivery-date-bulk" && r.request().method() === "PATCH"); await page.getByRole("button", { name: "Set delivery date", exact: true }).click(); expect((await dateResponse).status()).toBe(200);
    for (const order of [f.orders.websitePaid, f.orders.importedPaid]) expect((await state(request, order.id)).order.deliveryDate).toBe(future.toISOString());
  });
  test("cancelling delete keeps an order; confirming archives it and releases pending reservations", async ({ page, request }) => {
    await login(page, f.users.deleter); const order = f.orders.pending;
    await row(page, order).getByRole("button", { name: "Delete", exact: true }).click(); let confirm = modal(page, "Delete Order"); await confirm.getByRole("button", { name: "Cancel", exact: true }).click(); expect((await state(request, order.id)).order.archived).toBe(false);
    await row(page, order).getByRole("button", { name: "Delete", exact: true }).click(); confirm = modal(page, "Delete Order"); expect((await responseFor(page, order.id, "", "DELETE", () => confirm.getByRole("button", { name: "Delete", exact: true }).click())).status()).toBe(200);
    const after = await state(request, order.id); expect(after.order.archived).toBe(true); expect(variantState(after, f.variants.milk.id).reservedQuantity).toBe(0); expect(variantState(after, f.variants.milk.id).stockQuantity).toBe(100);
    await page.reload(); await expect(row(page, order)).toHaveCount(0); expect((await page.request.get(`${API}/admin/orders/${order.id}`)).status()).toBe(404);
  });
  test("bulk delete archives selected orders only and selection can be cleared", async ({ page, request }) => {
    await login(page, f.users.deleter); for (const order of [f.orders.websiteUnpaid, f.orders.importedUnpaid]) await row(page, order).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Clear Selection", exact: true }).click(); await expect(page.locator('tbody input[type="checkbox"]:checked')).toHaveCount(0);
    for (const order of [f.orders.websiteUnpaid, f.orders.importedUnpaid]) await row(page, order).getByRole("checkbox").check(); await page.getByRole("button", { name: "Delete…", exact: true }).click();
    const confirm = page.getByRole("heading", { name: /Delete.*orders/i }).locator("..").locator("..");
    const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/admin/orders/bulk" && r.request().method() === "DELETE"); await confirm.getByRole("button", { name: /Delete/i }).last().click(); expect((await response).status()).toBe(200);
    for (const order of [f.orders.websiteUnpaid, f.orders.importedUnpaid]) expect((await state(request, order.id)).order.archived).toBe(true); expect((await state(request, f.orders.websitePaid.id)).order.archived).toBe(false);
  });
  test("read-only staff can inspect orders but cannot see mutation controls", async ({ page }) => {
    await login(page, f.users.reader); await expect(row(page, f.orders.websitePaid).getByRole("button", { name: "Delete", exact: true })).toHaveCount(0); const detail = await open(page, f.orders.importedPaid);
    for (const name of ["Edit items", "Mark Unpaid", "Refund", "Update Status", "Add note"]) await expect(detail.getByRole("button", { name, exact: true })).toHaveCount(0);
  });
});

test.describe("Orders browser / Stock planning and variant editing", () => {
  test("selected-order stock preview matches quantities and never changes stock", async ({ page, request }) => {
    await login(page, f.users.admin); const before = await state(request, f.orders.websitePaid.id);
    for (const order of [f.orders.websitePaid, f.orders.importedPaid]) await row(page, order).getByRole("checkbox").check();
    await page.getByLabel("Count orders from", { exact: true }).selectOption("selected_orders");
    const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/admin/delivery/orders/stock" && r.request().method() === "POST");
    await page.getByRole("button", { name: "Calculate stock needed", exact: true }).click(); const result = await response; expect(result.status()).toBe(200);
    const body = await result.json(); expect(body.data.items.find(i => i.sku === "ORDER-E2E-MILK").totalQuantity).toBe(4); await expect(modal(page, "Stock Needed")).toBeVisible();
    expect(invariant(await state(request, f.orders.websitePaid.id))).toEqual(invariant(before));
  });
  test("uploaded CSV stock preview uses only the sheet and leaves orders unchanged", async ({ page, request }) => {
    await login(page, f.users.admin); const before = await state(request, f.orders.websitePaid.id); await page.getByLabel("Count orders from", { exact: true }).selectOption("file");
    await page.locator('input[type="file"]').setInputFiles({ name: "orders.csv", mimeType: "text/csv", buffer: Buffer.from("name,order\nAlice,2x ORDER-E2E-MILK\nBob,ORDER-E2E-MILK\n") });
    const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/admin/delivery/orders/stock" && r.request().method() === "POST"); await page.getByRole("button", { name: "Calculate stock needed", exact: true }).click();
    const result = await response; expect(result.status()).toBe(200); expect((await result.json()).data.items.find(i => i.sku === "ORDER-E2E-MILK").totalQuantity).toBe(3);
    expect(invariant(await state(request, f.orders.websitePaid.id))).toEqual(invariant(before));
  });
  test("adding a variant and removing an existing variant saves the correct snapshots", async ({ page, request }) => {
    await login(page, f.users.admin); const order = f.orders.importedUnpaid; const detail = await open(page, order); await detail.getByRole("button", { name: "Edit items", exact: true }).click();
    await detail.getByPlaceholder("Search variants…").fill("Orders E2E butter");
    await detail.getByRole("button", { name: /Orders E2E butter/ }).click();
    const milk = detail.getByRole("row").filter({ hasText: "Orders E2E milk" }); await milk.getByRole("button", { name: "Remove", exact: true }).click();
    const response = page.waitForResponse(r => new URL(r.url()).pathname === `/api/admin/orders/${order.id}/items` && r.request().method() === "PATCH"); await detail.getByRole("button", { name: "Save items", exact: true }).click(); expect((await response).status()).toBe(200);
    const after = await state(request, order.id); expect(after.order.items).toHaveLength(1); expect(after.order.items[0].variant).toBe(f.variants.butter.id); expect(after.order.subtotal).toBe(3); expect(after.order.total).toBe(4);
  });
});
