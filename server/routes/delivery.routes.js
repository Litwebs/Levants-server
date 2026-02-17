const express = require("express");
const router = express.Router();

const {
  listBatches,
  listEligibleOrders,
  listDrivers,
  getDepot,
  createBatch,
  lockBatch,
  unlockBatch,
  dispatchBatch,
  generateRoutes,
  getBatch,
  getRoute,
  getRouteStock,
} = require("../controllers/delivery.controller");

// Replace with your real auth middleware
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");

/**
 * GET /api/admin/delivery/batches
 * List delivery batches
 */
router.get(
  "/batches",
  requireAuth,
  requirePermission("delivery.routes.read"),
  listBatches,
);

/**
 * GET /api/admin/delivery/eligible-orders?deliveryDate=YYYY-MM-DD
 */
router.get(
  "/eligible-orders",
  requireAuth,
  requirePermission("delivery.routes.read"),
  listEligibleOrders,
);

/**
 * GET /api/admin/delivery/drivers
 */
router.get(
  "/drivers",
  requireAuth,
  requirePermission("delivery.routes.read"),
  listDrivers,
);

/**
 * GET /api/admin/delivery/depot
 */
router.get(
  "/depot",
  requireAuth,
  requirePermission("delivery.routes.read"),
  getDepot,
);

/**
 * POST /api/admin/delivery/batch
 * Create delivery batch
 */
router.post(
  "/batch",
  requireAuth,
  requirePermission("delivery.routes.update"),
  createBatch,
);

/**
 * PATCH /api/admin/delivery/batch/:batchId/lock
 */
router.patch(
  "/batch/:batchId/lock",
  requireAuth,
  requirePermission("delivery.routes.update"),
  lockBatch,
);

/**
 * PATCH /api/admin/delivery/batch/:batchId/unlock
 */
router.patch(
  "/batch/:batchId/unlock",
  requireAuth,
  requirePermission("delivery.routes.update"),
  unlockBatch,
);

/**
 * PATCH /api/admin/delivery/batch/:batchId/dispatch
 */
router.patch(
  "/batch/:batchId/dispatch",
  requireAuth,
  requirePermission("delivery.routes.update"),
  dispatchBatch,
);

/**
 * POST /api/admin/delivery/batch/:batchId/generate-routes
 */
router.post(
  "/batch/:batchId/generate-routes",
  requireAuth,
  requirePermission("delivery.routes.update"),
  generateRoutes,
);

/**
 * GET /api/admin/delivery/batch/:batchId
 */
router.get(
  "/batch/:batchId",
  requireAuth,
  requirePermission("delivery.routes.read"),
  getBatch,
);

/**
 * GET /api/admin/delivery/route/:routeId
 */
router.get(
  "/route/:routeId",
  requireAuth,
  requirePermission("delivery.routes.read"),
  getRoute,
);

router.get(
  "/route/:routeId/stock",
  requireAuth,
  requirePermission("delivery.routes.read"),
  getRouteStock,
);

module.exports = router;
