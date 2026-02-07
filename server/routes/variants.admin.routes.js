// src/routes/variants.admin.routes.js
const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { validateBody } = require("../middleware/validate.middleware");
const { apiLimiter } = require("../middleware/rateLimit.middleware");

const controller = require("../controllers/variants.admin.controller");
const {
  createVariantSchema,
  updateVariantSchema,
} = require("../validators/variant.validators");

const { validateParams } = require("../middleware/validate.middleware");
const {
  productIdParamSchema,
  variantIdParamSchema,
} = require("../validators/common.validators");

const router = express.Router();

router.use(requireAuth);
router.use(apiLimiter);

// variants.admin.routes.js
router.get(
  "/:productId/variants",
  requirePermission("products.read"),
  validateParams(productIdParamSchema),
  asyncHandler(controller.ListVariants),
);

router.post(
  "/:productId/variants",
  requirePermission("products.update"),
  validateBody(createVariantSchema),
  asyncHandler(controller.CreateVariant),
);

router.put(
  "/variants/:variantId",
  requirePermission("products.update"),
  validateBody(updateVariantSchema),
  validateParams(variantIdParamSchema),
  asyncHandler(controller.UpdateVariant),
);

router.delete(
  "/variants/:variantId",
  requirePermission("products.update"),
  validateParams(variantIdParamSchema),
  asyncHandler(controller.DeleteVariant),
);

module.exports = router;
