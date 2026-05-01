"use strict";

// Barrel re-export — keeps public API identical while each concern lives in its own module.
const batch = require("./delivery/delivery.batch.service");
const dispatch = require("./delivery/delivery.dispatch.service");
const drivers = require("./delivery/delivery.drivers.service");
const route = require("./delivery/delivery.route.service");
const stock = require("./delivery/delivery.stock.service");

module.exports = {
  ...batch,
  ...dispatch,
  ...drivers,
  ...route,
  ...stock,
};
