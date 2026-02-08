const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const { validateBody } = require("../middleware/validate.middleware");

const controller = require("../controllers/orders.public.controller");
const { createOrderSchema } = require("../validators/order.validators");

const router = express.Router();

/**
 * CREATE order (public – guest checkout)
 */
router.post(
  "/",
  validateBody(createOrderSchema),
  asyncHandler(controller.CreateOrder),
);

module.exports = router;
