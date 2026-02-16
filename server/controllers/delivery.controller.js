const {
  createDeliveryBatch,
  generateRoutes: generateRoutesService,
  getBatch: getBatchService,
  getRoute: getRouteService,
  getRouteStock: getRouteStockService,
} = require("../services/delivery.service");

/**
 * Create batch
 */
async function createBatch(req, res) {
  try {
    const { deliveryDate } = req.body;

    const result = await createDeliveryBatch({ deliveryDate });

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
/**
 * Generate routes
 */
async function generateRoutes(req, res) {
  const { batchId } = req.params;
  const result = await generateRoutesService({ batchId });
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
  createBatch,
  generateRoutes,
  getBatch,
  getRoute,
  getRouteStock,
};
