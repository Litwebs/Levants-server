const path = require("path");
const { defineConfig, devices } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./e2e/delivery-navigation",
  fullyParallel: true,
  timeout: 30_000,
  reporter: "list",
  outputDir: "test-results/delivery-navigation",
  use: { baseURL: "http://127.0.0.1:4175", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4175",
    cwd: path.resolve(__dirname, "../client"),
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "mobile-viewport", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
});
