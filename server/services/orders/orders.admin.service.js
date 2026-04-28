"use strict";

const list = require("./orders.list.service");
const status = require("./orders.status.service");
const manage = require("./orders.manage.service");
const del = require("./orders.delete.service");

module.exports = { ...list, ...status, ...manage, ...del };
