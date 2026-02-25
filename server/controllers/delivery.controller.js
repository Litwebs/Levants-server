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
  deleteBatch: deleteBatchService,
} = require("../services/delivery.service");

const { spreadsheetUploadToRows } = require("../utils/ordersSpreadsheet.util");

const parseStringArrayField = (value) => {
  if (Array.isArray(value)) return value.map((x) => String(x));
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // JSON array
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch (_) {}
  }

  // Comma/newline separated
  const parts = trimmed
    .split(/[\n,]/g)
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
};

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
    const { deliveryDate, startTime, endTime } = req.body;
    const orderIds = parseStringArrayField(req.body?.orderIds);

    const ordersSheet = req.file
      ? (() => {
          const { detectedType, rows, csvText } = spreadsheetUploadToRows({
            buffer: req.file.buffer,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
          });

          return {
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            sizeBytes: req.file.size,
            detectedType,
            rows,
            csvText,
            uploadedBy: req.user?._id,
          };
        })()
      : undefined;

    const result = await createDeliveryBatch({
      deliveryDate,
      orderIds,
      deliveryWindowStart: startTime,
      deliveryWindowEnd: endTime,
      ordersSheet,
    });

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

  const startTime =
    typeof req.body?.startTime === "string" ? req.body.startTime : undefined;
  const endTime =
    typeof req.body?.endTime === "string" ? req.body.endTime : undefined;

  const result = await generateRoutesService({
    batchId,
    driverIds,
    startTime,
    endTime,
  });
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

/**
 * Delete batch and associated routes/stops
 */
async function deleteBatch(req, res) {
  const { batchId } = req.params;
  const result = await deleteBatchService({ batchId });
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
  deleteBatch,
};
