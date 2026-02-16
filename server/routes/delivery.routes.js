const express = require("express");
const router = express.Router();

const {
  createBatch,
  generateRoutes,
  getBatch,
  getRoute,
  getRouteStock,
} = require("../controllers/delivery.controller");

// Replace with your real auth middleware
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");

/**
 * POST /api/admin/delivery/batch
 * Create delivery batch
 */
router.post(
  "/batch",
  requireAuth,
  requirePermission("delivery.manage"),
  createBatch,
);

/**
 * POST /api/admin/delivery/batch/:batchId/generate-routes
 */
router.post(
  "/batch/:batchId/generate-routes",
  requireAuth,
  requirePermission("delivery.manage"),
  generateRoutes,
);

/**
 * GET /api/admin/delivery/batch/:batchId
 */
router.get(
  "/batch/:batchId",
  requireAuth,
  requirePermission("delivery.read"),
  getBatch,
);

/**
 * GET /api/admin/delivery/route/:routeId
 */
router.get(
  "/route/:routeId",
  requireAuth,
  requirePermission("delivery.read"),
  getRoute,
);

router.get(
  "/route/:routeId/stock",
  requireAuth,
  requirePermission("delivery.read"),
  getRouteStock,
);

module.exports = router;
