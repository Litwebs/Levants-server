const path = require("node:path");
const base = require("../../jest.config");
module.exports = {
  ...base,
  rootDir: path.resolve(__dirname, "../.."),
  roots: ["<rootDir>/Tests/Deals"],
  setupFilesAfterEnv: [...base.setupFilesAfterEnv, "<rootDir>/Tests/Deals/helpers/mockProviders.js"],
};
