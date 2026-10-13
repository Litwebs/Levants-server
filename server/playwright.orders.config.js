"use strict";
const path = require("node:path");
const { defineConfig, devices } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./e2e/orders", testMatch: "**/*.spec.js", fullyParallel: false, workers: 1, retries: 0,
  timeout: 60_000, expect: { timeout: 10_000 }, outputDir: "test-results/orders",
  reporter: [["list"], ["html", { outputFolder: "playwright-report/orders", open: "never" }], ["json", { outputFile: "test-results/orders-report.json" }]],
  use: { baseURL: "http://localhost:4176", actionTimeout: 15_000, navigationTimeout: 30_000, trace: "retain-on-failure", screenshot: "only-on-failure", video: "retain-on-failure" },
  webServer: [
    { command: "node e2e/orders/support/start-stack.js", url: "http://127.0.0.1:5013/health", timeout: 120_000, reuseExistingServer: false },
    { command: "npm run dev -- --host 127.0.0.1 --port 4176 --strictPort", cwd: path.resolve(__dirname, "../client"), url: "http://localhost:4176", timeout: 120_000, reuseExistingServer: false },
  ],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testMatch: /\/(admin-orders|order-refunds)\.spec\.js$/, use: { ...devices["Pixel 7"] } },
  ],
});
