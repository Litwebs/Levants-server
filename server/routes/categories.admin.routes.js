const express = require("express");
const Joi = require("joi");

const asyncHandler = require("../utils/asyncHandler.util");
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { authLimiter } = require("../middleware/rateLimit.middleware");
const {
  validateBody,
  validateQuery,
  validateParams,
} = require("../middleware/validate.middleware");

const controller = require("../controllers/categories.controller");
const {
  createCategorySchema,
  updateCategorySchema,
} = require("../validators/category.validators");
const { objectIdParamSchema } = require("../validators/common.validators");

const router = express.Router();

router.use(requireAuth);
router.use(authLimiter);

router.get(
  "/",
  requirePermission("categories.read"),
  validateQuery(
    Joi.object({
      page: Joi.number().integer().min(1).optional(),
      pageSize: Joi.number().integer().min(1).max(200).optional(),
    }).unknown(false),
  ),
  asyncHandler(controller.ListCategories),
);

router.post(
  "/",
  requirePermission("categories.create"),
  validateBody(createCategorySchema),
  asyncHandler(controller.CreateCategory),
);

router.patch(
  "/:categoryId",
  requirePermission("categories.update"),
  validateParams(objectIdParamSchema("categoryId")),
  validateBody(updateCategorySchema),
  asyncHandler(controller.UpdateCategory),
);

router.delete(
  "/:categoryId",
  requirePermission("categories.delete"),
  validateParams(objectIdParamSchema("categoryId")),
  asyncHandler(controller.DeleteCategory),
);

module.exports = router;
