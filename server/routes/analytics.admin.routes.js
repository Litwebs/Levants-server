const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const {
  validateAnalyticsQuery,
} = require("../middleware/analyticsQuery.middleware");

const controller = require("../controllers/analytics.admin.controller");

const router = express.Router();

router.use(requireAuth);

// Nav badge counts only need auth — no analytics.read required.
router.get("/nav-counts", asyncHandler(controller.GetNavCounts));

router.use(requirePermission("analytics.read"));

router.get(
  "/dashboard",
  validateAnalyticsQuery({
    allowInterval: true,
    enforceSeriesBucketLimit: true,
  }),
  asyncHandler(controller.GetDashboard),
);

router.get(
  "/summary",
  validateAnalyticsQuery(),
  asyncHandler(controller.GetSummary),
);
router.get(
  "/comparison",
  validateAnalyticsQuery(),
  asyncHandler(controller.GetSummaryComparison),
);
router.get(
  "/revenue-composition",
  validateAnalyticsQuery(),
  asyncHandler(controller.GetRevenueComposition),
);

router.get(
  "/sales-breakdown",
  validateAnalyticsQuery(),
  asyncHandler(controller.GetSalesBreakdown),
);

router.get(
  "/sales-trends",
  validateAnalyticsQuery({
    allowInterval: true,
    enforceSeriesBucketLimit: true,
  }),
  asyncHandler(controller.GetSalesTrends),
);

router.get(
  "/revenue",
  validateAnalyticsQuery({
    allowInterval: true,
    enforceSeriesBucketLimit: true,
  }),
  asyncHandler(controller.GetRevenueSeries),
);
router.get(
  "/revenue-overview",
  validateAnalyticsQuery({ allowDays: true }),
  asyncHandler(controller.GetRevenueOverview),
);
router.get(
  "/order-status",
  validateAnalyticsQuery(),
  asyncHandler(controller.GetOrderStatusCounts),
);
router.get(
  "/top-products",
  validateAnalyticsQuery({ maxLimit: 25 }),
  asyncHandler(controller.GetTopProducts),
);
router.get(
  "/variant-units",
  validateAnalyticsQuery({ maxLimit: 25 }),
  asyncHandler(controller.GetVariantUnits),
);
router.get(
  "/variant-revenue",
  validateAnalyticsQuery({ maxLimit: 25 }),
  asyncHandler(controller.GetVariantRevenue),
);
router.get(
  "/variant-realised-price",
  validateAnalyticsQuery({ maxLimit: 25 }),
  asyncHandler(controller.GetVariantRealisedPrice),
);
router.get(
  "/variant-price-comparison",
  validateAnalyticsQuery({ maxLimit: 25 }),
  asyncHandler(controller.GetVariantPriceComparison),
);
router.get(
  "/variant-sales-mix",
  validateAnalyticsQuery({ maxLimit: 25 }),
  asyncHandler(controller.GetVariantSalesMix),
);
router.get(
  "/variant-contribution",
  validateAnalyticsQuery({ maxLimit: 25 }),
  asyncHandler(controller.GetVariantContribution),
);
router.get(
  "/variant-trends",
  validateAnalyticsQuery({
    allowInterval: true,
    maxLimit: 10,
    enforceSeriesBucketLimit: true,
  }),
  asyncHandler(controller.GetVariantTrends),
);
router.get(
  "/product-trends",
  validateAnalyticsQuery({
    allowInterval: true,
    maxLimit: 10,
    enforceSeriesBucketLimit: true,
  }),
  asyncHandler(controller.GetProductTrends),
);
router.get(
  "/products/:productId",
  validateAnalyticsQuery({
    allowInterval: true,
    enforceSeriesBucketLimit: true,
  }),
  asyncHandler(controller.GetProductDetail),
);
router.get(
  "/recent-orders",
  validateAnalyticsQuery({ maxLimit: 25 }),
  asyncHandler(controller.GetRecentOrders),
);
router.get(
  "/low-stock",
  validateAnalyticsQuery({ maxLimit: 200 }),
  asyncHandler(controller.GetLowStock),
);

module.exports = router;
