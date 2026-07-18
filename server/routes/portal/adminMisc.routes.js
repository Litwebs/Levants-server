"use strict";

const express = require("express");
const asyncHandler = require("../../utils/asyncHandler.util");
const { requireAuth } = require("../../middleware/auth.middleware");
const { requirePermission } = require("../../middleware/permission.middleware");
const {
  validateBody,
  validateParams,
} = require("../../middleware/validate.middleware");

const supportController = require("../../controllers/portal/adminSupport.controller");
const paymentController = require("../../controllers/portal/adminPayments.controller");
const reportsController = require("../../controllers/portal/adminReports.controller");
const {
  updateSupportStatusSchema,
  addSupportNoteSchema,
  updatePaymentStatusSchema,
  supportRequestIdParamSchema,
} = require("../../validators/portal.validators");

// ===== Support Routes =====
const supportRouter = express.Router();
supportRouter.use(requireAuth);
supportRouter.use(requirePermission("customers.read"));

supportRouter.get("/", asyncHandler(supportController.ListSupportRequests));

supportRouter.get(
  "/:supportRequestId",
  validateParams(supportRequestIdParamSchema),
  asyncHandler(supportController.GetSupportRequest),
);

supportRouter.patch(
  "/:supportRequestId",
  requirePermission("customers.update"),
  validateParams(supportRequestIdParamSchema),
  validateBody(updateSupportStatusSchema),
  asyncHandler(supportController.UpdateSupportRequest),
);

supportRouter.post(
  "/:supportRequestId/notes",
  requirePermission("customers.update"),
  validateParams(supportRequestIdParamSchema),
  validateBody(addSupportNoteSchema),
  asyncHandler(supportController.AddNote),
);

// ===== Payment Routes =====
const paymentsRouter = express.Router();
paymentsRouter.use(requireAuth);
paymentsRouter.use(requirePermission("orders.read"));

paymentsRouter.get("/", asyncHandler(paymentController.ListPayments));

paymentsRouter.get("/:paymentId", asyncHandler(paymentController.GetPayment));

paymentsRouter.patch(
  "/:paymentId",
  requirePermission("orders.payment.update"),
  validateBody(updatePaymentStatusSchema),
  asyncHandler(paymentController.UpdatePaymentStatus),
);

// ===== Reports Routes =====
const reportsRouter = express.Router();
reportsRouter.use(requireAuth);
reportsRouter.use(requirePermission("analytics.read"));

reportsRouter.get(
  "/customer-portal-summary",
  asyncHandler(reportsController.CustomerPortalSummary),
);
reportsRouter.get(
  "/subscriptions-summary",
  asyncHandler(reportsController.SubscriptionsSummary),
);
reportsRouter.get(
  "/deliveries-summary",
  asyncHandler(reportsController.DeliveriesSummary),
);

module.exports = { supportRouter, paymentsRouter, reportsRouter };
