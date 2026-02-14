const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");

const controller = require("../controllers/analytics.admin.controller");

const router = express.Router();

router.use(requireAuth);
// Dashboard analytics needs both orders and products.
router.use(requirePermission("analytics.read"));

// Single call for the whole analytics page
router.get("/dashboard", asyncHandler(controller.GetDashboard));

// Granular endpoints
router.get("/summary", asyncHandler(controller.GetSummary));
router.get("/revenue", asyncHandler(controller.GetRevenueSeries));
router.get("/revenue-overview", asyncHandler(controller.GetRevenueOverview));
router.get("/order-status", asyncHandler(controller.GetOrderStatusCounts));
router.get("/top-products", asyncHandler(controller.GetTopProducts));
router.get("/recent-orders", asyncHandler(controller.GetRecentOrders));
router.get("/low-stock", asyncHandler(controller.GetLowStock));

module.exports = router;
