const path = require("path");
const original = require("./playwright.config");
const { API_ORIGIN } = require("./e2e/support/constants");
module.exports = {
  ...original,
  testDir: "./e2e/deals",
  webServer: original.webServer.map(server => ({
    ...server,
    env: {
      ...server.env,
      E2E_DEALS_BROWSER: "1",
      JWT_ACCESS_EXPIRES_IN: "15m",
      JWT_REFRESH_EXPIRES_IN: "7d",
      ...(server.cwd === path.resolve(__dirname, "../client")
        ? { VITE_API_BASE_URL: `${API_ORIGIN}/api` } : {}),
    },
  })),
};
