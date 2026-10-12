const path = require("path");
module.exports = {
  rootDir: path.resolve(__dirname, "../.."),
  testEnvironment: "node",
  roots: ["<rootDir>/IntegrationTests/Deals"],
  setupFiles: ["<rootDir>/Tests/env.js"],
  setupFilesAfterEnv: ["<rootDir>/Tests/setup.js"],
  testMatch: ["**/*.e2e.test.js"],
};
