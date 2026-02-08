const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { validateBody } = require("../middleware/validate.middleware");

const controller = require("../controllers/orders.admin.controller");
const { updateOrderStatusSchema } = require("../validators/order.validators");

const router = express.Router();

router.use(requireAuth);
router.use(requirePermission("orders.read"));

router.get("/", asyncHandler(controller.ListOrders));

router.get("/:orderId", asyncHandler(controller.GetOrderById));

router.put(
  "/:orderId/status",
  requirePermission("orders.update"),
  validateBody(updateOrderStatusSchema),
  asyncHandler(controller.UpdateOrderStatus),
);

module.exports = router;
