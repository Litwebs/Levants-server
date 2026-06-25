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
