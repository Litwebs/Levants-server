"use strict";

const { test, expect } = require("@playwright/test");
const sharp = require("sharp");
const { reset } = require("../support/e2e-client");
const { API_ORIGIN, CONTROL_ORIGIN, CONTROL_TOKEN } = require("../support/constants");
const ADMIN = "http://127.0.0.1:4174";
const headers = { "x-e2e-control-token": CONTROL_TOKEN };

test.beforeEach(async ({ request }) => { await reset(request); });
test.afterAll(async ({ request }) => { await reset(request); });

async function start(page, request, createOffer = false) {
  const response = await request.post(`${CONTROL_ORIGIN}/deal-fixtures`, { headers, data: { basketScenarios: true, createOffer } });
  expect(response.ok(), await response.text()).toBeTruthy();
  const data = (await response.json()).data;
  const login = await page.request.post(`${API_ORIGIN}/api/auth/login`, { data: data.adminCredentials });
  expect(login.ok(), await login.text()).toBeTruthy();
  return data;
}

async function read(page, id) {
  const result = await page.request.get(`${API_ORIGIN}/api/admin/deals/${id}`);
  expect(result.ok(), await result.text()).toBeTruthy();
  return (await result.json()).data.deal;
}

async function manageRow(page, row, action) {
  await row.click();
  await page.getByRole("button", { name: "Manage deal", exact: true }).click();
  const response = page.waitForResponse(r => r.request().method() !== "GET" && r.url().includes("/admin/deals/"));
  await page.screenshot({ path: `test-results/deal-menu-${page.viewportSize().width}.png` });
  await page.getByRole("menuitem", { name: action, exact: true }).click();
  if (action === "Archive") await page.getByRole("button", { name: "Archive deal", exact: true }).click();
  await response;
  if (action !== "Archive") {
    await expect(page.getByRole("button", { name: "Deals & Product Packages", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Deals & Product Packages", exact: true }).click();
  }
  await expect(page).toHaveURL(`${ADMIN}/deals`);
}

for (const width of [1440, 390]) {
  test(`admin reopens, clears and rebuilds incomplete drafts at ${width}px`, async ({ page, request }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const data = await start(page, request);
    const name = `Incomplete package ${width}`;
    await page.goto(`${ADMIN}/deals/new`);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByLabel("Deal name *").fill(name);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page).toHaveURL(`${ADMIN}/deals`);
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("Draft");
    const listed = await page.request.get(`${API_ORIGIN}/api/admin/deals`, { params: { search: name } });
    expect(listed.ok()).toBeTruthy();
    const id = (await listed.json()).data.deals[0]._id;
    const saved = await read(page, id);
    const publicUrl = `${API_ORIGIN}/api/deals/${saved.slug}`;

    // A name-only draft must remain editable after a reload, using the actual
    // browser PATCH payload rather than a description-only API request.
    await page.reload();
    await row.click();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page).toHaveURL(`${ADMIN}/deals`);
    expect(await read(page, id)).toMatchObject({ items: [], publicationStatus: "draft" });
    expect((await request.get(publicUrl)).status()).toBe(404);

    await row.click();
    await page.getByRole("row").filter({ hasText: data.variants.MILK.name })
      .getByRole("button", { name: "Add variant Standard", exact: true }).click();
    await page.getByRole("button", { name: "Details & pricing", exact: true }).click();
    await expect(page.getByLabel("Package price (£) *")).toHaveValue("");
    await page.getByLabel("Package price (£) *").fill("4");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page).toHaveURL(`${ADMIN}/deals`);
    expect((await read(page, id)).items).toHaveLength(1);

    await row.click();
    await page.getByRole("button", { name: `Remove ${data.variants.MILK.name} Standard`, exact: true }).click();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page).toHaveURL(`${ADMIN}/deals`);
    expect(await read(page, id)).toMatchObject({ items: [], publicationStatus: "draft", packagePrice: 4 });
    expect((await request.get(publicUrl)).status()).toBe(404);
    await manageRow(page, row, "Publish");
    await expect(page.getByText("Add at least one product to publish", { exact: true })).toBeVisible();
    await expect(row).toContainText("Draft");

    await row.click();
    await page.getByRole("row").filter({ hasText: data.variants.MILK.name })
      .getByRole("button", { name: "Add variant Standard", exact: true }).click();
    await page.getByRole("button", { name: "Details & pricing", exact: true }).click();
    await page.getByLabel("Package price (£) *").fill("");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page).toHaveURL(`${ADMIN}/deals`);
    await page.reload();
    await row.click();
    await page.getByRole("button", { name: "Details & pricing", exact: true }).click();
    await expect(page.getByLabel("Package price (£) *")).toHaveValue("");
    await page.getByLabel("Package price (£) *").fill("4");
    await page.getByRole("button", { name: "Review & publish", exact: true }).click();
    await page.getByRole("button", { name: "Publish deal", exact: true }).click();
    await expect(page).toHaveURL(`${ADMIN}/deals`);
    expect(await read(page, id)).toMatchObject({ publicationStatus: "published", packagePrice: 4 });
    expect((await request.get(publicUrl)).status()).toBe(200);
    await info.attach(`rebuilt-draft-${width}`, { body: await page.screenshot(), contentType: "image/png" });
  });
}

for (const [mode, width] of [["fixed_price", 1440], ["fixed_saving", 390], ["percentage_saving", 1440]]) {
  test(`admin saves a draft, previews, publishes and manages ${mode}`, async ({ page, request }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const data = await start(page, request);
    const name = `Milk package ${mode}`;
    await page.goto(`${ADMIN}/deals/new`);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByLabel("Deal name *").fill(name);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page).toHaveURL(`${ADMIN}/deals`);
    let row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("Draft");
    const listed = await page.request.get(`${API_ORIGIN}/api/admin/deals`, { params: { search: name } });
    const id = (await listed.json()).data.deals[0]._id;
    const draft = await read(page, id);
    expect(draft.publicationStatus).toBe("draft");
    expect((await request.get(`${API_ORIGIN}/api/deals/${draft.slug}`)).status()).toBe(404);
    await manageRow(page, row, "Publish");
    await expect(page.getByText("Add at least one product to publish", { exact: true })).toBeVisible();
    await expect(row).toContainText("Draft");
    await row.click();
    await page.getByRole("row").filter({ hasText: data.variants.MILK.name }).getByRole("button", { name: "Add variant Standard", exact: true }).click();
    await page.getByRole("spinbutton", { name: `Quantity for Standard (${data.variants.MILK.name})` }).fill("2");
    await page.getByRole("button", { name: "Details & pricing", exact: true }).click();
    await page.getByLabel("Description", { exact: true }).fill("Two fresh bottles with a defined package saving.");
    await page.getByLabel("Pricing method", { exact: true }).selectOption(mode);
    await page.getByLabel(mode === "fixed_price" ? "Package price (£) *" : mode === "fixed_saving" ? "Saving (£) *" : "Saving (%) *").fill(mode === "fixed_price" ? "8" : mode === "fixed_saving" ? "2" : "20");
    await page.getByRole("button", { name: "Review & publish", exact: true }).click();
    const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#e4c592" } }).png().toBuffer();
    await page.locator('input[type="file"]').setInputFiles({ name: "milk-package.png", mimeType: "image/png", buffer: image });
    await expect(page.getByAltText("Package preview")).toBeVisible();
    await page.locator('label[for="deal-featured"]').click();
    await expect(page.getByRole("checkbox", { name: "Feature this deal" })).toBeChecked();
    await page.getByRole("button", { name: "Preview storefront", exact: true }).click();
    const preview = page.getByRole("dialog", { name: "Customer storefront preview" });
    await expect(preview).toContainText("Draft");
    await expect(preview).toContainText("£8.00");
    await preview.getByRole("button", { name: "Mobile", exact: true }).click();
    await preview.getByRole("button", { name: "Details page", exact: true }).click();
    await expect(preview.getByRole("heading", { name, exact: true })).toBeVisible();
    await info.attach(`preview-${mode}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    await preview.getByRole("button", { name: "Close preview", exact: true }).click();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page).toHaveURL(`${ADMIN}/deals`);
    await page.reload();
    row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("£8.00");
    await row.click();
    await page.getByRole("button", { name: "Details & pricing", exact: true }).click();
    await expect(page.getByLabel("Pricing method", { exact: true })).toHaveValue(mode);
    await page.getByRole("button", { name: "Review & publish", exact: true }).click();
    await page.getByRole("button", { name: "Publish deal", exact: true }).click();
    await expect(page).toHaveURL(`${ADMIN}/deals`);
    const published = await read(page, id);
    expect(published).toMatchObject({ publicationStatus: "published", pricingMode: mode, packagePrice: 8, savings: 2, isFeatured: true, description: "Two fresh bottles with a defined package saving." });
    expect(published.savingValue).toBe(mode === "fixed_price" ? null : mode === "fixed_saving" ? 2 : 20);
    expect(published.image.url).toBeTruthy();
    const publicUrl = `${API_ORIGIN}/api/deals/${published.slug}`;
    expect((await request.get(publicUrl)).status()).toBe(200);
    await manageRow(page, row, "Unpublish");
    await expect(row).toContainText("Draft");
    expect((await request.get(publicUrl)).status()).toBe(404);
    await manageRow(page, row, "Publish");
    await expect(row).toContainText("Featured");
    await manageRow(page, row, "Deactivate");
    await expect(row).toContainText("Inactive");
    expect((await request.get(publicUrl)).status()).toBe(404);
    await manageRow(page, row, "Activate");
    await expect(row).toContainText("Featured");
    expect((await request.get(publicUrl)).status()).toBe(200);
    await manageRow(page, row, "Archive");
    await expect(row).toContainText("Archived");
    expect((await request.get(publicUrl)).status()).toBe(404);
    await expect(row.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test("admin validation blocks invalid savings and schedules and allows correcting them", async ({ page, request }) => {
  const data = await start(page, request, true);
  await page.goto(`${ADMIN}/deals/${data.deal._id}/edit`);
  await page.getByRole("button", { name: "Details & pricing", exact: true }).click();
  await page.getByLabel("Pricing method").selectOption("percentage_saving");
  await page.getByLabel("Saving (%) *").fill("100");
  await page.getByRole("button", { name: "Review & publish", exact: true }).click();
  await expect(page.getByText("Enter a positive saving; percentages must be below 100%.")).toBeVisible();
  await page.getByRole("button", { name: "20% off", exact: true }).click();
  await expect(page.getByLabel("Pricing method")).toHaveValue("percentage_saving");
  await expect(page.getByLabel("Saving (%) *")).toHaveValue("20");
  await page.getByRole("button", { name: "Review & publish", exact: true }).click();
  await page.getByLabel("Starts at").fill("2035-02-02T10:00");
  await page.getByLabel("Ends at").fill("2035-02-01T10:00");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("End date must be after the start date.")).toBeVisible();
  await page.getByLabel("Ends at").fill("2035-02-03T10:00");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(`${ADMIN}/deals`);
  await expect(page.getByRole("row").filter({ hasText: "Fresh milk package" })).toContainText("Scheduled");
  const saved = await read(page, data.deal._id);
  expect(saved.pricingMode).toBe("percentage_saving");
  expect((await request.get(`${API_ORIGIN}/api/deals/${saved.slug}`)).status()).toBe(404);
  await page.getByRole("row").filter({ hasText: "Fresh milk package" }).click();
  await page.getByRole("button", { name: "Details & pricing", exact: true }).click();
  await page.getByLabel("Pricing method").selectOption("fixed_price");
  await page.getByLabel("Package price (£) *").fill("7");
  await page.getByRole("button", { name: "Review & publish", exact: true }).click();
  await page.getByLabel("Starts at").fill("");
  await page.getByLabel("Ends at").fill("");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(`${ADMIN}/deals`);
  expect(await read(page, data.deal._id)).toMatchObject({ pricingMode: "fixed_price", savingValue: null, packagePrice: 7, startsAt: null, endsAt: null });
  expect((await request.get(`${API_ORIGIN}/api/deals/${saved.slug}`)).status()).toBe(200);
});

test("stock lost before publication keeps the draft recoverable", async ({ page, request }) => {
  const data = await start(page, request, true);
  await page.goto(`${ADMIN}/deals`);
  const row = page.getByRole("row").filter({ hasText: "Fresh milk package" });
  await manageRow(page, row, "Unpublish");
  await expect(row).toContainText("Draft");
  const stock = async quantity => {
    const result = await request.post(`${CONTROL_ORIGIN}/deal-test/stock`, { headers, data: { variantId: data.variants.MILK.id, stockQuantity: quantity } });
    expect(result.ok(), await result.text()).toBeTruthy();
  };
  await stock(0);
  await manageRow(page, row, "Publish");
  await expect(page.getByText("Deal contents do not have enough available stock to publish", { exact: true })).toBeVisible();
  expect((await read(page, data.deal._id)).publicationStatus).toBe("draft");
  await stock(10000);
  await manageRow(page, row, "Publish");
  await expect(row).toContainText("Featured");
});
