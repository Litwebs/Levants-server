const express = require("express");
const asyncHandler = require("../utils/asyncHandler.util");
const { validateBody } = require("../middleware/validate.middleware");
const { createRateLimiter } = require("../middleware/rateLimit.middleware");

const controller = require("../controllers/customers.controller");
const {
  createCustomerSchema,
  createGuestCustomerSchema,
} = require("../validators/customer.validators");

const router = express.Router();

// Route-specific limiter for customer creation (public)
// Keep max low enough to deterministically trigger in tests.
const createCustomerLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  legacyHeaders: true,
});

// Public customer create (guest checkout)
router.post(
  "/",
  createCustomerLimiter,
  validateBody(createCustomerSchema, { stripUnknown: false }),
  asyncHandler(controller.CreateCustomer),
);

// Guest checkout customer
router.post(
  "/guest",
  validateBody(createGuestCustomerSchema),
  asyncHandler(controller.CreateGuestCustomer),
);

module.exports = router;
