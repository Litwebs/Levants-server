"use strict";

// Barrel re-export — keeps public API identical while each concern lives in its own module.
const core = require("./auth.core.service");
const password = require("./auth.password.service");
const session = require("./auth.session.service");
const profile = require("./auth.profile.service");
const admin = require("./auth.admin.service");

module.exports = {
  ...core,
  ...password,
  ...session,
  ...profile,
  ...admin,
};
