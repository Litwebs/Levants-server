"use strict";

const express = require("express");
const asyncHandler = require("../../utils/asyncHandler.util");
const {
  requireCustomerAuth,
} = require("../../middleware/customerAuth.middleware");

const notifController = require("../../controllers/portal/customerNotifications.controller");
const supportController = require("../../controllers/portal/customerSupport.controller");
const paymentController = require("../../controllers/portal/customerPayments.controller");
const {
  validateBody,
  validateParams,
} = require("../../middleware/validate.middleware");
const {
  createSupportRequestSchema,
  supportRequestIdParamSchema,
} = require("../../validators/portal.validators");

const notifRouter = express.Router();
notifRouter.use(requireCustomerAuth);
notifRouter.get("/", asyncHandler(notifController.ListNotifications));
notifRouter.patch(
  "/:notificationId/read",
  asyncHandler(notifController.MarkAsRead),
);
notifRouter.post("/read-all", asyncHandler(notifController.MarkAllAsRead));

const supportRouter = express.Router();
supportRouter.use(requireCustomerAuth);
supportRouter.post(
  "/",
  validateBody(createSupportRequestSchema),
  asyncHandler(supportController.CreateSupportRequest),
);
supportRouter.get("/", asyncHandler(supportController.ListSupportRequests));
supportRouter.get(
  "/:supportRequestId",
  validateParams(supportRequestIdParamSchema),
  asyncHandler(supportController.GetSupportRequest),
);

const paymentRouter = express.Router();
paymentRouter.use(requireCustomerAuth);
paymentRouter.get("/", asyncHandler(paymentController.ListPayments));
paymentRouter.get(
  "/payment-methods",
  asyncHandler(paymentController.ListPaymentMethods),
);
paymentRouter.post(
  "/payment-methods/:paymentMethodId/default",
  asyncHandler(paymentController.SetDefaultPaymentMethod),
);
paymentRouter.delete(
  "/payment-methods/:paymentMethodId",
  asyncHandler(paymentController.DeletePaymentMethod),
);

module.exports = { notifRouter, supportRouter, paymentRouter };
