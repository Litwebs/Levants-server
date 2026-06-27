"use strict";

const express = require("express");
const asyncHandler = require("../../utils/asyncHandler.util");
const {
  requireCustomerAuth,
} = require("../../middleware/customerAuth.middleware");
const {
  validateBody,
  validateParams,
} = require("../../middleware/validate.middleware");

const controller = require("../../controllers/portal/customerSubscriptions.controller");
const {
  createSubscriptionSchema,
  updateSubscriptionSchema,
  subscriptionItemSchema,
  updateSubscriptionItemSchema,
  subscriptionIdParamSchema,
  subscriptionItemIdParamSchema,
} = require("../../validators/portal.validators");

const router = express.Router();

router.use(requireCustomerAuth);

router.post(
  "/",
  validateBody(createSubscriptionSchema),
  asyncHandler(controller.CreateSubscription),
);

router.get("/", asyncHandler(controller.ListSubscriptions));

router.get("/settings", asyncHandler(controller.GetSubscriptionSettings));

router.get(
  "/:subscriptionId",
  validateParams(subscriptionIdParamSchema),
  asyncHandler(controller.GetSubscription),
);

router.patch(
  "/:subscriptionId",
  validateParams(subscriptionIdParamSchema),
  validateBody(updateSubscriptionSchema),
  asyncHandler(controller.UpdateSubscription),
);

router.post(
  "/:subscriptionId/pause",
  validateParams(subscriptionIdParamSchema),
  asyncHandler(controller.PauseSubscription),
);

router.post(
  "/:subscriptionId/resume",
  validateParams(subscriptionIdParamSchema),
  asyncHandler(controller.ResumeSubscription),
);

router.post(
  "/:subscriptionId/cancel",
  validateParams(subscriptionIdParamSchema),
  asyncHandler(controller.CancelSubscription),
);

router.post(
  "/:subscriptionId/items",
  validateParams(subscriptionIdParamSchema),
  validateBody(subscriptionItemSchema),
  asyncHandler(controller.AddSubscriptionItem),
);

router.patch(
  "/:subscriptionId/items/:itemId",
  validateParams(subscriptionItemIdParamSchema),
  validateBody(updateSubscriptionItemSchema),
  asyncHandler(controller.UpdateSubscriptionItem),
);

router.delete(
  "/:subscriptionId/items/:itemId",
  validateParams(subscriptionItemIdParamSchema),
  asyncHandler(controller.RemoveSubscriptionItem),
);

router.get(
  "/:subscriptionId/deliveries",
  validateParams(subscriptionIdParamSchema),
  asyncHandler(controller.GetSubscriptionDeliveries),
);

module.exports = router;
