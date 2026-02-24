const express = require("express");
const Joi = require("joi");

const asyncHandler = require("../utils/asyncHandler.util");
const { validateBody } = require("../middleware/validate.middleware");

const {
  checkDeliveryPostcode,
} = require("../controllers/delivery.public.controller");

const router = express.Router();

const deliveryCheckBodySchema = Joi.object({
  postcode: Joi.string().trim().min(2).max(12).required(),
}).unknown(false);

// POST /api/delivery/check { postcode: "BD5 0AL" }
router.post(
  "/check",
  validateBody(deliveryCheckBodySchema),
  asyncHandler(checkDeliveryPostcode),
);

module.exports = router;
