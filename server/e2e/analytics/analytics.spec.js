"use strict";

const { test, expect } = require("@playwright/test");

const API_ORIGIN = "http://127.0.0.1:5001";

const waitForDashboard = (page, predicate = () => true) =>
  page.waitForResponse((response) => {
    if (!response.url().includes("/api/admin/analytics/dashboard")) return false;
    if (response.request().method() !== "GET") return false;
    return response.status() === 200 && predicate(new URL(response.url()));
  });

const attachBrowserDiagnostics = (page) => {
  const pageErrors = [];
  const consoleErrors = [];
  const failedAnalyticsRequests = [];
  const badAnalyticsResponses = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    if (!request.url().includes("/api/admin/analytics/")) return;
    failedAnalyticsRequests.push(
      `${request.method()} ${request.url()} :: ${request.failure()?.errorText || "failed"}`,
    );
  });
  page.on("response", (response) => {
    if (!response.url().includes("/api/admin/analytics/")) return;
    if (response.status() < 500) return;
    badAnalyticsResponses.push(
      `${response.status()} ${response.request().method()} ${response.url()}`,
    );
  });

  return {
    assertClean() {
      expect(pageErrors, "uncaught browser errors").toEqual([]);
      expect(consoleErrors, "browser console errors").toEqual([]);
      expect(failedAnalyticsRequests, "failed analytics requests").toEqual([]);
      expect(badAnalyticsResponses, "5xx analytics responses").toEqual([]);
    },
  };
};

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

test("admin analytics supports real filters, comparisons, trends, drilldowns, and CSV export", async ({
  page,
}) => {
  const diagnostics = attachBrowserDiagnostics(page);

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

  const previousYearResponse = waitForDashboard(
    page,
    (url) => url.searchParams.get("comparison") === "previous_year",
  );
  await page.getByLabel("Comparison").selectOption("previous_year");
  await previousYearResponse;
  await expect(page.getByText("vs previous year", { exact: true }).first())
    .toBeVisible();

  const weeklyResponse = waitForDashboard(
    page,
    (url) => url.searchParams.get("interval") === "week",
  );
  await page.getByLabel("Interval").selectOption("week");
  await weeklyResponse;

  for (const title of [
    "Revenue Trend",
    "Orders Trend",
    "Sales Channel Trend",
    "Product Revenue Trend",
    "Product Units Trend",
    "Variant Revenue Trend",
    "Variant Units Trend",
  ]) {
    await expect(page.getByRole("heading", { name: title, exact: true }))
      .toBeVisible();
  }

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

  diagnostics.assertClean();
});

test("admin analytics handles direct routes, empty periods, and retryable dashboard errors", async ({
  page,
}) => {
  const dashboardPattern = "**/api/admin/analytics/dashboard**";

  await page.route(dashboardPattern, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: "Synthetic analytics failure",
      }),
    });
  });

  await page.goto("/analytics");
  await expect(
    page.getByRole("alert").getByText("Analytics could not be loaded", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry", exact: true }))
    .toBeVisible();

  await page.unroute(dashboardPattern);
  const retryResponse = waitForDashboard(page);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await retryResponse;
  await expect(page.getByRole("heading", { name: "Revenue Trend", exact: true }))
    .toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);

  await page.getByLabel("Date range").selectOption("custom");
  await page.getByLabel("From date").fill("2025-01-01");
  const emptyResponse = waitForDashboard(
    page,
    (url) =>
      url.searchParams.get("from") === "2025-01-01" &&
      url.searchParams.get("to") === "2025-01-02",
  );
  await page.getByLabel("To date").fill("2025-01-02");
  await emptyResponse;
  await expect(page.getByText("No activity for these filters", { exact: true }))
    .toBeVisible();

  await page.goto("/reports");
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.getByRole("heading", { name: "Analytics", exact: true }))
    .toBeVisible();
});

test("admin analytics stays usable on a mobile viewport without browser or analytics API errors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const diagnostics = attachBrowserDiagnostics(page);

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Analytics", exact: true }))
    .toBeVisible();
  await expect(page.getByLabel("Date range")).toBeVisible();
  await expect(page.getByLabel("Order source")).toBeVisible();
  await expect(page.getByLabel("Comparison")).toBeVisible();
  await expect(page.getByLabel("Interval")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Subscription Analytics", exact: true }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "Low Stock Alert", exact: true }))
    .toBeVisible();

  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewport + 1);

  diagnostics.assertClean();
});
