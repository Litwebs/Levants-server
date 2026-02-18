const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { validateBody } = require("../middleware/validate.middleware");

const businessInfoController = require("../controllers/businessInfo.controller");
const {
  updateBusinessInfoSchema,
} = require("../validators/businessInfo.validators");

const router = express.Router();

/**
 * GET business info
 */
router.get(
  "/",
  requireAuth,
  requirePermission("business.info.read"),
  asyncHandler(businessInfoController.GetBusinessInfo),
);

/**
 * UPDATE business info
 */
router.put(
  "/",
  requireAuth,
  requirePermission("business.info.update"),
  validateBody(updateBusinessInfoSchema),
  asyncHandler(businessInfoController.UpdateBusinessInfo),
);

module.exports = router;
