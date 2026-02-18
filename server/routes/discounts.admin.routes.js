const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { authLimiter } = require("../middleware/rateLimit.middleware");
const {
  validateBody,
  validateQuery,
  validateParams,
} = require("../middleware/validate.middleware");

const controller = require("../controllers/discounts.admin.controller");
const { createDiscountSchema } = require("../validators/discount.validators");
const { objectIdParamSchema } = require("../validators/common.validators");

const router = express.Router();

router.use(requireAuth);
router.use(authLimiter);

router.get(
  "/",
  requirePermission("promotions.read"),
  validateQuery(
    // Optional pagination params
    require("joi")
      .object({
        page: require("joi").number().integer().min(1).optional(),
        pageSize: require("joi").number().integer().min(1).max(100).optional(),
      })
      .unknown(false),
  ),
  asyncHandler(controller.ListDiscounts),
);

router.get(
  "/:discountId",
  requirePermission("promotions.read"),
  validateParams(objectIdParamSchema("discountId")),
  validateQuery(
    require("joi")
      .object({
        page: require("joi").number().integer().min(1).optional(),
        pageSize: require("joi").number().integer().min(1).max(100).optional(),
      })
      .unknown(false),
  ),
  asyncHandler(controller.GetDiscountDetails),
);

router.post(
  "/",
  requirePermission("promotions.create"),
  validateBody(createDiscountSchema),
  asyncHandler(controller.CreateDiscount),
);

router.delete(
  "/:discountId",
  requirePermission("promotions.delete"),
  validateParams(objectIdParamSchema("discountId")),
  asyncHandler(controller.DeactivateDiscount),
);

module.exports = router;
