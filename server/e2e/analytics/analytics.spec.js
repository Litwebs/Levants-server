"use strict";

const { test, expect } = require("@playwright/test");

const API_ORIGIN = "http://127.0.0.1:5001";

const waitForDashboard = (page, predicate = () => true) =>
  page.waitForResponse((response) => {
    if (!response.url().includes("/api/admin/analytics/dashboard")) return false;
    if (response.request().method() !== "GET") return false;
    return response.status() === 200 && predicate(new URL(response.url()));
  });

test.beforeEach(async ({ page }) => {
  const login = await page.request.post(`${API_ORIGIN}/api/auth/login`, {
    data: {
      email: "analytics.admin@example.com",
      password: "AnalyticsE2E1!",
      rememberMe: false,
    },
  });
  expect(login.ok()).toBeTruthy();
});

test("admin analytics supports real filters, drilldowns, and CSV export", async ({
  page,
}) => {
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Analytics", exact: true }))
    .toBeVisible();

  await page.getByLabel("Date range").selectOption("custom");
  await expect(page.getByText("Choose a complete custom date range"))
    .toBeVisible();

  await page.getByLabel("From date").fill("2026-06-10");
  const allSourcesResponse = waitForDashboard(
    page,
    (url) =>
      url.searchParams.get("from") === "2026-06-10" &&
      url.searchParams.get("to") === "2026-06-12",
  );
  await page.getByLabel("To date").fill("2026-06-12");
  await allSourcesResponse;

  await expect(page.getByText("Analytics Milk", { exact: true }).first())
    .toBeVisible();
  await expect(page.getByText("Analytics Eggs", { exact: true }).first())
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "Low Stock Alert", exact: true }))
    .toBeVisible();
  await expect(page.getByText(/Analytics Milk · Milk 1L/)).toBeVisible();

  const subscriptionResponse = waitForDashboard(
    page,
    (url) => url.searchParams.get("orderSource") === "subscription",
  );
  await page.getByLabel("Order source").selectOption("subscription");
  await subscriptionResponse;

  const subscriptionProductTable = page
    .getByText("Product Performance", { exact: true })
    .last()
    .locator("xpath=ancestor::section[1]");
  await expect(
    subscriptionProductTable.getByText("Analytics Eggs", { exact: true }),
  ).toBeVisible();
  await expect(
    subscriptionProductTable.getByText("Analytics Milk", { exact: true }),
  ).toHaveCount(0);

  const allSourcesAgain = waitForDashboard(
    page,
    (url) => url.searchParams.get("orderSource") === "all",
  );
  await page.getByLabel("Order source").selectOption("all");
  await allSourcesAgain;

  const productPerformanceCard = page
    .getByRole("heading", { name: "Product Performance", exact: true })
    .locator("xpath=../../..");
  const milkRankInfo = productPerformanceCard
    .getByText("Analytics Milk", { exact: true })
    .first()
    .locator("..");
  await milkRankInfo.getByRole("button", { name: "View details" }).click();

  const productDetail = page.locator("#product-analytics-detail");
  await expect(
    productDetail.getByText(
      "Historical product performance for the selected filters",
    ),
  ).toBeVisible();
  await expect(
    productDetail.getByText("AN-MILK-1L", { exact: true }),
  ).toBeVisible();

  await productDetail
    .getByRole("button", { name: "View variant", exact: true })
    .click();

  const variantDetail = page.locator("#variant-analytics-detail");
  await expect(
    variantDetail.getByRole("heading", { name: "Milk 1L", exact: true }),
  ).toBeVisible();
  await expect(
    variantDetail.getByText("Analytics Milk · AN-MILK-1L", { exact: true }),
  ).toBeVisible();

  await variantDetail
    .getByRole("button", { name: "Close", exact: true })
    .click();

  const exportSection = page
    .getByText("Product Performance", { exact: true })
    .last()
    .locator("xpath=ancestor::section[1]");
  const downloadPromise = page.waitForEvent("download");
  await exportSection.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toContain(
    "analytics-products-2026-06-10-2026-06-12-all.csv",
  );
  const csvPath = await download.path();
  expect(csvPath).toBeTruthy();
  const csv = require("fs").readFileSync(csvPath, "utf8");
  expect(csv).toContain("Product,Catalog Status,Revenue");
  expect(csv).toContain("Analytics Milk");
  expect(csv).toContain("Analytics Eggs");
});
