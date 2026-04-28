"use strict";

const list = require("./orders/orders.list.service");
const status = require("./orders/orders.status.service");
const manage = require("./orders/orders.manage.service");
const del = require("./orders/orders.delete.service");

module.exports = { ...list, ...status, ...manage, ...del };
