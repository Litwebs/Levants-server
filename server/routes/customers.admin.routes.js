const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const {
  validateBody,
  validateQuery,
  validateParams,
} = require("../middleware/validate.middleware");

const controller = require("../controllers/customers.controller");
const {
  updateCustomerSchema,
  listCustomersQuerySchema,
} = require("../validators/customer.validators");

const { customerIdParamSchema } = require("../validators/common.validators");

const router = express.Router();

router.use(requireAuth);

// List customers
router.get(
  "/",
  requirePermission("customers.*"),
  validateQuery(listCustomersQuerySchema),
  asyncHandler(controller.ListCustomers),
);

// Get customer
router.get(
  "/:customerId",
  requirePermission("customers.*"),
  validateParams(customerIdParamSchema),
  asyncHandler(controller.GetCustomerById),
);

// Update customer
router.put(
  "/:customerId",
  requirePermission("customers.update"),
  validateParams(customerIdParamSchema),
  validateBody(updateCustomerSchema),
  asyncHandler(controller.UpdateCustomer),
);

// Get orders by customer (admin)
router.get(
  "/:customerId/orders",
  requirePermission("customers.*"),
  validateParams(customerIdParamSchema),
  validateQuery(listCustomersQuerySchema), // reuse page/pageSize/search pattern
  asyncHandler(controller.ListOrdersByCustomer),
);

module.exports = router;
