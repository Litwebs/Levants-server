"use strict";

const path = require("path");
const { defineConfig, devices } = require("@playwright/test");

const ADMIN_ORIGIN = "http://127.0.0.1:4174";
const API_ORIGIN = "http://127.0.0.1:5001";

module.exports = defineConfig({
  testDir: "./e2e/analytics",
  testMatch: "**/*.spec.js",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["line"],
    ["html", { outputFolder: "playwright-report-analytics", open: "never" }],
  ],
  outputDir: "test-results/playwright-analytics",
  use: {
    baseURL: ADMIN_ORIGIN,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "node e2e/analytics/start-analytics-stack.js",
      url: `${API_ORIGIN}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { ...process.env },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4174",
      cwd: path.resolve(__dirname, "../client"),
      url: ADMIN_ORIGIN,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        VITE_API_BASE_URL: `${API_ORIGIN}/api`,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
