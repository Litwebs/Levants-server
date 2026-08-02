"use strict";

const express = require("express");
const asyncHandler = require("../../utils/asyncHandler.util");
const {
  requireCustomerAuth,
} = require("../../middleware/customerAuth.middleware");

const controller = require("../../controllers/portal/customerCredits.controller");

const router = express.Router();

router.use(requireCustomerAuth);

router.get("/", asyncHandler(controller.GetMyCredit));

module.exports = router;
