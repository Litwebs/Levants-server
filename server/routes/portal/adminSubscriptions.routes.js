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
  createCustomerOnboardingLinkSchema,
  bulkCustomerOnboardingLinksSchema,
} = require("../../validators/customer.validators");
const {
  subscriptionIdParamSchema,
  subscriptionLookupIdParamSchema,
  updateSubscriptionSchema,
} = require("../../validators/portal.validators");

const router = express.Router();

const denyAdminItemMutation = (_req, _res, next) =>
  next({
    statusCode: 403,
    message: "Subscription products cannot be changed by admins",
  });

router.use(requireAuth);
router.use(requirePermission("orders.read")); // subscriptions are part of orders domain

router.get("/", asyncHandler(controller.ListSubscriptions));

router.post(
  "/setup-link",
  requirePermission("orders.update"),
  validateBody(createCustomerOnboardingLinkSchema),
  asyncHandler(controller.CreateSubscriptionSetupLink),
);

router.post(
  "/bulk-setup-links",
  requirePermission("subscriptions.import"),
  validateBody(bulkCustomerOnboardingLinksSchema),
  asyncHandler(controller.CreateBulkSubscriptionSetupLinks),
);

router.get(
  "/:subscriptionId",
  validateParams(subscriptionLookupIdParamSchema),
  asyncHandler(controller.GetSubscription),
);

router.patch(
  "/:subscriptionId",
  requirePermission("orders.update"),
  validateParams(subscriptionIdParamSchema),
  validateBody(updateSubscriptionSchema),
  asyncHandler(controller.UpdateSubscription),
);

router.delete(
  "/:subscriptionId/pending-setup",
  requirePermission("orders.update"),
  validateParams(subscriptionLookupIdParamSchema),
  asyncHandler(controller.DeletePendingSubscription),
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

// Subscription composition is customer-managed. Keep explicit denial routes
// so older admin clients receive a clear response instead of a generic 404.
router.post("/:subscriptionId/items", denyAdminItemMutation);
router.patch("/:subscriptionId/items/:itemId", denyAdminItemMutation);
router.delete("/:subscriptionId/items/:itemId", denyAdminItemMutation);

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
