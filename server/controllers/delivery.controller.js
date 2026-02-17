const {
  createDeliveryBatch,
  listBatches: listBatchesService,
  listEligibleOrders: listEligibleOrdersService,
  listDrivers: listDriversService,
  getDepot: getDepotService,
  lockBatch: lockBatchService,
  unlockBatch: unlockBatchService,
  dispatchBatch: dispatchBatchService,
  generateRoutes: generateRoutesService,
  getBatch: getBatchService,
  getRoute: getRouteService,
  getRouteStock: getRouteStockService,
} = require("../services/delivery.service");

async function listBatches(req, res) {
  const { fromDate, toDate, status } = req.query;
  const result = await listBatchesService({ fromDate, toDate, status });
  if (!result.success) {
    return res.status(result.statusCode || 400).json(result);
  }
  return res.status(200).json(result);
}

async function listEligibleOrders(req, res) {
  const { deliveryDate } = req.query;
  const result = await listEligibleOrdersService({ deliveryDate });
  if (!result.success) {
    return res.status(result.statusCode || 400).json(result);
  }
  return res.status(200).json(result);
}

async function listDrivers(req, res) {
  const result = await listDriversService();
  if (!result.success) {
    return res.status(result.statusCode || 400).json(result);
  }
  return res.status(200).json(result);
}

async function getDepot(req, res) {
  const result = await getDepotService();
  if (!result.success) {
    return res.status(result.statusCode || 400).json(result);
  }
  return res.status(200).json(result);
}

/**
 * Create batch
 */
async function createBatch(req, res) {
  try {
    const { deliveryDate, orderIds } = req.body;

    const result = await createDeliveryBatch({ deliveryDate, orderIds });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(201).json(result);
  } catch (err) {
    console.error("Create batch error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create delivery batch",
    });
  }
}

async function lockBatch(req, res) {
  const { batchId } = req.params;
  const result = await lockBatchService({ batchId });
  if (!result.success) {
    return res.status(result.statusCode || 400).json(result);
  }
  return res.status(200).json(result);
}

async function unlockBatch(req, res) {
  const { batchId } = req.params;
  const result = await unlockBatchService({ batchId });
  if (!result.success) {
    return res.status(result.statusCode || 400).json(result);
  }
  return res.status(200).json(result);
}

async function dispatchBatch(req, res) {
  const { batchId } = req.params;
  const result = await dispatchBatchService({ batchId });
  if (!result.success) {
    return res.status(result.statusCode || 400).json(result);
  }
  return res.status(200).json(result);
}
/**
 * Generate routes
 */
async function generateRoutes(req, res) {
  const { batchId } = req.params;
  const driverIds = Array.isArray(req.body?.driverIds)
    ? req.body.driverIds
    : undefined;

  const result = await generateRoutesService({ batchId, driverIds });
  if (!result.success) {
    return res.status(result.statusCode || 400).json(result);
  }
  return res.status(200).json(result);
}

/**
 * Get batch with populated data
 */
async function getBatch(req, res) {
  const { batchId } = req.params;
  const result = await getBatchService({ batchId });
  if (!result.success) {
    return res.status(result.statusCode || 400).json(result);
  }
  return res.status(200).json(result);
}

/**
 * Get route details (with stops)
 */
async function getRoute(req, res) {
  const { routeId } = req.params;
  const result = await getRouteService({ routeId });
  if (!result.success) {
    return res.status(result.statusCode || 400).json(result);
  }
  return res.status(200).json(result);
}

async function getRouteStock(req, res) {
  const { routeId } = req.params;
  const result = await getRouteStockService({ routeId });
  if (!result.success) {
    return res.status(result.statusCode || 400).json(result);
  }
  return res.status(200).json(result);
}

module.exports = {
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
};
