"use strict";

const express = require("express");
const asyncHandler = require("../../utils/asyncHandler.util");
const { requireAuth } = require("../../middleware/auth.middleware");
const { requirePermission } = require("../../middleware/permission.middleware");
const {
  validateBody,
  validateParams,
} = require("../../middleware/validate.middleware");

const controller = require("../../controllers/portal/adminSubscriptions.controller");
const {
  subscriptionIdParamSchema,
  subscriptionItemIdParamSchema,
  updateSubscriptionSchema,
  subscriptionItemSchema,
  updateSubscriptionItemSchema,
} = require("../../validators/portal.validators");

const router = express.Router();

router.use(requireAuth);
router.use(requirePermission("orders.read")); // subscriptions are part of orders domain

router.get("/", asyncHandler(controller.ListSubscriptions));

router.get(
  "/:subscriptionId",
  validateParams(subscriptionIdParamSchema),
  asyncHandler(controller.GetSubscription),
);

router.patch(
  "/:subscriptionId",
  requirePermission("orders.update"),
  validateParams(subscriptionIdParamSchema),
  validateBody(updateSubscriptionSchema),
  asyncHandler(controller.UpdateSubscription),
);

router.post(
  "/:subscriptionId/pause",
  requirePermission("orders.update"),
  validateParams(subscriptionIdParamSchema),
  asyncHandler(controller.PauseSubscription),
);

router.post(
  "/:subscriptionId/resume",
  requirePermission("orders.update"),
  validateParams(subscriptionIdParamSchema),
  asyncHandler(controller.ResumeSubscription),
);

router.post(
  "/:subscriptionId/cancel",
  requirePermission("orders.update"),
  validateParams(subscriptionIdParamSchema),
  asyncHandler(controller.CancelSubscription),
);

router.post(
  "/:subscriptionId/items",
  requirePermission("orders.update"),
  validateParams(subscriptionIdParamSchema),
  validateBody(subscriptionItemSchema),
  asyncHandler(controller.AddSubscriptionItem),
);

router.patch(
  "/:subscriptionId/items/:itemId",
  requirePermission("orders.update"),
  validateParams(subscriptionItemIdParamSchema),
  validateBody(updateSubscriptionItemSchema),
  asyncHandler(controller.UpdateSubscriptionItem),
);

router.delete(
  "/:subscriptionId/items/:itemId",
  requirePermission("orders.update"),
  validateParams(subscriptionItemIdParamSchema),
  asyncHandler(controller.RemoveSubscriptionItem),
);

router.get(
  "/:subscriptionId/deliveries",
  validateParams(subscriptionIdParamSchema),
  asyncHandler(controller.GetSubscriptionDeliveries),
);

router.get(
  "/:subscriptionId/orders",
  validateParams(subscriptionIdParamSchema),
  asyncHandler(controller.GetSubscriptionOrders),
);

module.exports = router;
