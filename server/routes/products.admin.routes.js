// src/routes/products.admin.routes.js
const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { validateBody } = require("../middleware/validate.middleware");
const { authLimiter } = require("../middleware/rateLimit.middleware");

const controller = require("../controllers/products.admin.controller");
const {
  createProductSchema,
  updateProductSchema,
} = require("../validators/product.validators");

const router = express.Router();

router.use(requireAuth);
router.use(authLimiter);

// LIST
router.get(
  "/",
  requirePermission("products.read"),
  asyncHandler(controller.ListProducts),
);

// GET
router.get(
  "/:productId",
  requirePermission("products.read"),
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
  validateBody(updateProductSchema),
  asyncHandler(controller.UpdateProduct),
);

// DELETE (archive)
router.delete(
  "/:productId",
  requirePermission("products.delete"),
  asyncHandler(controller.DeleteProduct),
);

module.exports = router;
