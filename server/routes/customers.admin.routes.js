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
  adjustCustomerCreditSchema,
} = require("../validators/customer.validators");

const { customerIdParamSchema } = require("../validators/common.validators");

const router = express.Router();

router.use(requireAuth);

// List customers
router.get(
  "/",
  requirePermission("customers.read"),
  validateQuery(listCustomersQuerySchema),
  asyncHandler(controller.ListCustomers),
);

// Get customer
router.get(
  "/:customerId",
  requirePermission("customers.read"),
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
  requirePermission(["customers.read", "orders.read"]),
  validateParams(customerIdParamSchema),
  validateQuery(listCustomersQuerySchema), // reuse page/pageSize/search pattern
  asyncHandler(controller.ListOrdersByCustomer),
);

// Get subscriptions by customer (admin)
router.get(
  "/:customerId/subscriptions",
  requirePermission(["customers.read", "orders.read"]),
  validateParams(customerIdParamSchema),
  asyncHandler(controller.ListSubscriptionsByCustomer),
);

// Get support requests by customer (admin)
router.get(
  "/:customerId/support-requests",
  requirePermission("customers.read"),
  validateParams(customerIdParamSchema),
  asyncHandler(controller.ListSupportRequestsByCustomer),
);

// Get a customer's store-credit balance + ledger (admin)
router.get(
  "/:customerId/credit",
  requirePermission("customers.credit.read"),
  validateParams(customerIdParamSchema),
  validateQuery(listCustomersQuerySchema),
  asyncHandler(controller.GetCustomerCredit),
);

// Manually adjust a customer's store credit (admin)
router.post(
  "/:customerId/credit/adjust",
  requirePermission("customers.credit.update"),
  validateParams(customerIdParamSchema),
  validateBody(adjustCustomerCreditSchema),
  asyncHandler(controller.AdjustCustomerCredit),
);

module.exports = router;
