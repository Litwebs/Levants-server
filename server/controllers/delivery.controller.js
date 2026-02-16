const { createDeliveryBatch } = require("../services/deliveryBatch.service");

const { generateRoutesForBatch } = require("../services/route.service");

const { getRouteStockAggregation } = require("../services/warehouse.service");
const { generateGoogleMapsLink } = require("../utils/navigation.util");
const DeliveryBatch = require("../models/deliveryBatch.model");
const Route = require("../models/route.model");
const Stop = require("../models/stop.model");

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
  try {
    const { batchId } = req.params;

    const result = await generateRoutesForBatch({ batchId });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("Generate routes error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to generate routes",
    });
  }
}

/**
 * Get batch with populated data
 */
async function getBatch(req, res) {
  try {
    const { batchId } = req.params;

    const batch = await DeliveryBatch.findById(batchId)
      .populate("orders")
      .populate({
        path: "routes",
        populate: {
          path: "driver",
          select: "name email",
        },
      });

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: batch,
    });
  } catch (err) {
    console.error("Get batch error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch batch",
    });
  }
}

/**
 * Get route details (with stops)
 */
async function getRoute(req, res) {
  try {
    const { routeId } = req.params;

    const route = await Route.findById(routeId)
      .populate("driver", "name email")
      .lean();

    if (!route) {
      return res.status(404).json({
        success: false,
        message: "Route not found",
      });
    }

    const stops = await Stop.find({ route: routeId })
      .sort({ sequence: 1 })
      .populate("order")
      .lean();

    const enrichedStops = stops.map((stop) => ({
      ...stop,
      navigationUrl: generateGoogleMapsLink(
        stop.order.location.lat,
        stop.order.location.lng,
      ),
    }));

    return res.status(200).json({
      success: true,
      data: {
        route,
        stops: enrichedStops,
      },
    });
  } catch (err) {
    console.error("Get route error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch route",
    });
  }
}

async function getRouteStock(req, res) {
  try {
    const { routeId } = req.params;

    const result = await getRouteStockAggregation({ routeId });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("Warehouse aggregation error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to generate stock list",
    });
  }
}

module.exports = {
  createBatch,
  generateRoutes,
  getBatch,
  getRoute,
  getRouteStock,
};
