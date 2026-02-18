// src/routes/products.admin.routes.js
const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const {
  validateBody,
  validateQuery,
} = require("../middleware/validate.middleware");
const { authLimiter } = require("../middleware/rateLimit.middleware");
const { validateParams } = require("../middleware/validate.middleware");

const controller = require("../controllers/products.admin.controller");
const {
  createProductSchema,
  updateProductSchema,
  adminProductsQuerySchema,
} = require("../validators/product.validators");

const { productIdParamSchema } = require("../validators/common.validators");

const router = express.Router();

router.use(requireAuth);
router.use(authLimiter);

// LIST
router.get(
  "/",
  requirePermission("products.read"),
  validateQuery(adminProductsQuerySchema),
  asyncHandler(controller.ListProducts),
);

// GET
router.get(
  "/:productId",
  requirePermission("products.read"),
  validateParams(productIdParamSchema),
  asyncHandler(controller.GetProduct),
);

// CREATE
router.post(
  "/",
  requirePermission("products.create"),
  validateBody(createProductSchema),
  asyncHandler(controller.CreateProduct),
);

// UPDATE
router.put(
  "/:productId",
  requirePermission("products.update"),
  validateParams(productIdParamSchema),
  validateBody(updateProductSchema),
  asyncHandler(controller.UpdateProduct),
);

// DELETE (archive)
router.delete(
  "/:productId",
  requirePermission("products.delete"),
  validateParams(productIdParamSchema),
  asyncHandler(controller.DeleteProduct),
);

module.exports = router;
