const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const {
  validateBody,
  validateParams,
} = require("../middleware/validate.middleware");

const controller = require("../controllers/orders.admin.controller");
const { updateOrderStatusSchema } = require("../validators/order.validators");

const { refundOrderSchema } = require("../validators/orderRefund.validator");
const { orderIdParamSchema } = require("../validators/common.validators");

const router = express.Router();

router.use(requireAuth);
router.use(requirePermission("orders.read"));

router.get("/", asyncHandler(controller.ListOrders));

router.get(
  "/:orderId",
  validateParams(orderIdParamSchema),
  asyncHandler(controller.GetOrderById),
);

router.put(
  "/:orderId/status",
  requirePermission("orders.update"),
  validateParams(orderIdParamSchema),
  validateBody(updateOrderStatusSchema),
  asyncHandler(controller.UpdateOrderStatus),
);

router.post(
  "/:orderId/refund",
  requirePermission("orders.refund"),
  validateParams(orderIdParamSchema),
  validateBody(refundOrderSchema),
  asyncHandler(controller.RefundOrder),
);

module.exports = router;
