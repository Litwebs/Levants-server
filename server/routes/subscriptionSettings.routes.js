"use strict";

const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { validateBody } = require("../middleware/validate.middleware");

const controller = require("../controllers/subscriptionSettings.controller");
const {
  updateSubscriptionSettingsSchema,
} = require("../validators/subscriptionSettings.validators");

const router = express.Router();

router.get(
  "/",
  requireAuth,
  requirePermission("business.info.read"),
  asyncHandler(controller.GetSubscriptionSettings),
);

router.put(
  "/",
  requireAuth,
  requirePermission("business.info.update"),
  validateBody(updateSubscriptionSettingsSchema),
  asyncHandler(controller.UpdateSubscriptionSettings),
);

module.exports = router;
