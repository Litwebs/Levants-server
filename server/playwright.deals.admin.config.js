"use strict";

const { defineConfig, devices } = require("@playwright/test");
const { CONTROL_ORIGIN } = require("./e2e/support/constants");

module.exports = defineConfig({
  testDir: "./e2e/deals",
  testMatch: ["basket-admin.spec.js", "deals-admin.spec.js"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results/playwright",
  use: {
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/support/start-real-stripe-stack.js",
      url: `${CONTROL_ORIGIN}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { ...process.env, E2E_DEALS_BROWSER: "1", E2E_USE_STRIPE_CLI: "0", E2E_USE_TEST_CLOCKS: "0" },
    },
    {
      command: "npm --prefix ../client run build && node e2e/deals/serve-admin.js",
      url: "http://127.0.0.1:4174",
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
