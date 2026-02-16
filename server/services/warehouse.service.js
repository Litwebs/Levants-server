const Route = require("../models/route.model");
const Stop = require("../models/stop.model");
const Order = require("../models/order.model");

/**
 * Get aggregated stock list for a route
 */
async function getRouteStockAggregation({ routeId }) {
  if (!routeId) {
    return { success: false, message: "routeId is required" };
  }

  const route = await Route.findById(routeId);
  if (!route) {
    return { success: false, message: "Route not found" };
  }

  // 1️⃣ Get stops ordered
  const stops = await Stop.find({ route: routeId })
    .sort({ sequence: 1 })
    .populate({
      path: "order",
      select: "items orderId",
    });

  if (!stops.length) {
    return { success: false, message: "No stops found for this route" };
  }

  const aggregationMap = new Map();

  // 2️⃣ Aggregate stock
  for (const stop of stops) {
    const order = stop.order;

    if (!order || !order.items) continue;

    for (const item of order.items) {
      const key = String(item.variant);

      if (!aggregationMap.has(key)) {
        aggregationMap.set(key, {
          variantId: item.variant,
          productId: item.product,
          sku: item.sku,
          name: item.name,
          unitPrice: item.price,
          totalQuantity: 0,
          orders: [],
        });
      }

      const entry = aggregationMap.get(key);

      entry.totalQuantity += item.quantity;

      entry.orders.push({
        orderId: order.orderId,
        quantity: item.quantity,
      });
    }
  }

  const aggregatedItems = Array.from(aggregationMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return {
    success: true,
    data: {
      routeId,
      totalUniqueProducts: aggregatedItems.length,
      items: aggregatedItems,
    },
  };
}

module.exports = {
  getRouteStockAggregation,
};
