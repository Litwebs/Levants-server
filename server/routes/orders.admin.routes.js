const express = require("express");
const multer = require("multer");

const asyncHandler = require("../utils/asyncHandler.util");
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const {
  validateBody,
  validateParams,
} = require("../middleware/validate.middleware");

const controller = require("../controllers/orders.admin.controller");
const {
  updateOrderStatusSchema,
  updateOrderPaymentSchema,
  bulkUpdateDeliveryStatusSchema,
  bulkAssignDeliveryDateSchema,
  updateOrderItemsSchema,
  bulkDeleteOrdersSchema,
} = require("../validators/order.validators");

const { refundOrderSchema } = require("../validators/orderRefund.validator");
const { orderIdParamSchema } = require("../validators/common.validators");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024, // up to 8MB proof images
  },
  fileFilter: (req, file, cb) => {
    if (file && typeof file.mimetype === "string") {
      if (file.mimetype.startsWith("image/")) return cb(null, true);
    }
    const err = new Error("deliveryProof must be an image");
    // @ts-ignore
    err.statusCode = 400;
    return cb(err);
  },
});

router.use(requireAuth);
router.use(requirePermission("orders.read"));

router.get("/", asyncHandler(controller.ListOrders));

router.get(
  "/:orderId",
  validateParams(orderIdParamSchema),
  asyncHandler(controller.GetOrderById),
);

router.put(
  "/bulk/delivery-status",
  requirePermission("orders.update"),
  validateBody(bulkUpdateDeliveryStatusSchema),
  asyncHandler(controller.BulkUpdateDeliveryStatus),
);

router.delete(
  "/bulk",
  requirePermission("orders.delete"),
  validateBody(bulkDeleteOrdersSchema),
  asyncHandler(controller.BulkDeleteOrders),
);

router.put(
  "/:orderId/status",
  requirePermission("orders.update"),
  validateParams(orderIdParamSchema),
  upload.single("deliveryProof"),
  validateBody(updateOrderStatusSchema),
  asyncHandler(controller.UpdateOrderStatus),
);

router.patch(
  "/:orderId/payment",
  requirePermission(["orders.update", "orders.payment.update"]),
  validateParams(orderIdParamSchema),
  validateBody(updateOrderPaymentSchema),
  asyncHandler(controller.UpdateOrderPaymentStatus),
);

router.patch(
  "/:orderId/items",
  requirePermission("orders.update"),
  validateParams(orderIdParamSchema),
  validateBody(updateOrderItemsSchema),
  asyncHandler(controller.UpdateOrderItems),
);

router.delete(
  "/:orderId",
  requirePermission("orders.delete"),
  validateParams(orderIdParamSchema),
  asyncHandler(controller.DeleteOrder),
);

router.post(
  "/:orderId/refund",
  requirePermission("orders.refund"),
  validateParams(orderIdParamSchema),
  validateBody(refundOrderSchema),
  asyncHandler(controller.RefundOrder),
);

router.patch(
  "/assign-delivery-date-bulk",
  requirePermission("orders.update"),
  validateBody(bulkAssignDeliveryDateSchema),
  asyncHandler(controller.bulkAssignDeliveryDate),
);

module.exports = router;
