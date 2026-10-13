const path = require("path");
const original = require("./playwright.config");
module.exports = {
  ...original,
  testDir: "./e2e/deals",
  webServer: original.webServer.map(server => ({
    ...server,
    ...(server.cwd === path.resolve(__dirname, "../client") ? { command: "node e2e/deals/serve-admin.js", cwd: __dirname } : {}),
    env: {
      ...server.env,
      E2E_DEALS_BROWSER: "1",
      JWT_ACCESS_EXPIRES_IN: "15m",
      JWT_REFRESH_EXPIRES_IN: "7d",
    },
  })),
};
