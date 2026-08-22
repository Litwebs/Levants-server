"use strict";

const path = require("path");
const { defineConfig, devices } = require("@playwright/test");
const {
  API_ORIGIN,
  CLIENT_ORIGIN,
  CONTROL_ORIGIN,
} = require("./e2e/support/constants");
const portalClientRoot = process.env.E2E_CLIENT_DIR
  ? path.resolve(process.env.E2E_CLIENT_DIR)
  : path.resolve(__dirname, "../../Levants-client");

module.exports = defineConfig({
  testDir: "./e2e/portal-subscriptions",
  testMatch: "**/*.spec.js",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["line"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  outputDir: "test-results/playwright",
  use: {
    baseURL: CLIENT_ORIGIN,
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "node e2e/support/start-real-stripe-stack.js",
      url: `${CONTROL_ORIGIN}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        E2E_USE_STRIPE_CLI: process.env.E2E_USE_STRIPE_CLI || "0",
        E2E_USE_TEST_CLOCKS: process.env.E2E_USE_TEST_CLOCKS || "0",
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4173",
      cwd: portalClientRoot,
      url: CLIENT_ORIGIN,
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
