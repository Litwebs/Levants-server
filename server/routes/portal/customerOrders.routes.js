"use strict";

const express = require("express");
const asyncHandler = require("../../utils/asyncHandler.util");
const {
  requireCustomerAuth,
} = require("../../middleware/customerAuth.middleware");
const {
  validateBody,
  validateParams,
  validateQuery,
} = require("../../middleware/validate.middleware");

const controller = require("../../controllers/portal/customerOrders.controller");
const {
  customerPortalOrderSchema,
  cancelOrderSchema,
  updateOrderDeliverySchema,
  portalListQuerySchema,
} = require("../../validators/portal.validators");
const { orderIdParamSchema } = require("../../validators/common.validators");

const router = express.Router();

router.use(requireCustomerAuth);

router.post(
  "/",
  validateBody(customerPortalOrderSchema),
  asyncHandler(controller.PlaceOrder),
);

router.get(
  "/",
  validateQuery(portalListQuerySchema),
  asyncHandler(controller.ListOrders),
);

router.get(
  "/:orderId",
  validateParams(orderIdParamSchema),
  asyncHandler(controller.GetOrder),
);

router.patch(
  "/:orderId/delivery",
  validateParams(orderIdParamSchema),
  validateBody(updateOrderDeliverySchema),
  asyncHandler(controller.UpdateOrderDelivery),
);

router.get(
  "/:orderId/receipt",
  validateParams(orderIdParamSchema),
  asyncHandler(controller.DownloadReceipt),
);

router.get(
  "/:orderId/receipt-url",
  validateParams(orderIdParamSchema),
  asyncHandler(controller.GetReceiptUrl),
);

router.get(
  "/:orderId/receipt/custom",
  validateParams(orderIdParamSchema),
  asyncHandler(controller.RenderCustomReceipt),
);

router.post(
  "/:orderId/cancel",
  validateParams(orderIdParamSchema),
  validateBody(cancelOrderSchema),
  asyncHandler(controller.CancelOrder),
);

router.post(
  "/:orderId/reorder",
  validateParams(orderIdParamSchema),
  asyncHandler(controller.Reorder),
);

module.exports = router;
