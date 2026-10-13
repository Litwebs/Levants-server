// Pure navigation and mocked route-service checks do not need a database.
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/Tests/Delivery/navigation"],
  testMatch: ["**/navigationLinks.util.test.js", "**/getRoute.navigation.service.test.js"],
  setupFiles: ["<rootDir>/Tests/env.js"],
  clearMocks: true,
};
