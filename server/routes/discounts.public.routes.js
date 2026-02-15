const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const {
  validateBody,
  validateQuery,
} = require("../middleware/validate.middleware");

const controller = require("../controllers/discounts.public.controller");
const {
  validateDiscountSchema,
  listActiveDiscountsQuerySchema,
} = require("../validators/discount.validators");

const router = express.Router();

/**
 * VALIDATE discount code (public – before checkout)
 */
router.post(
  "/validate",
  validateBody(validateDiscountSchema),
  asyncHandler(controller.ValidateDiscount),
);

/**
 * LIST active discount codes (public)
 */
router.get(
  "/active",
  validateQuery(listActiveDiscountsQuerySchema),
  asyncHandler(controller.ListActiveDiscounts),
);

module.exports = router;
