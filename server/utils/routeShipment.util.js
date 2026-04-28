/**
 * Helpers for building and resolving the shipment payload sent to
 * Google Route Optimization, and for decoding its response back to
 * our grouped-order model.
 */

/** Extracts the encoded polyline string from a Google route response object. */
function extractEncodedPolyline(routeData) {
  if (!routeData || typeof routeData !== "object") return null;

  const points =
    routeData.routePolyline?.points || routeData.polyline?.points || null;

  return typeof points === "string" && points.trim() ? points : null;
}

/**
 * Returns the service time (seconds) to allocate to a stop with `orderCount`
 * orders: 2 min base + 1 min per additional order, capped at 12 min.
 */
function computeServiceSeconds(orderCount) {
  const base = 120;
  const perExtraOrder = 60;
  const max = 12 * 60;

  return Math.min(max, base + Math.max(0, orderCount - 1) * perExtraOrder);
}

/**
 * Collapses orders that share the same lat/lng into a single group.
 * Each group carries the list of co-located orders so one shipment can
 * represent multiple deliveries at the same address.
 */
function groupOrdersByLocation(orders) {
  const groupedOrders = [];
  const map = new Map();

  for (const order of orders) {
    const lat = Number(order.location.lat);
    const lng = Number(order.location.lng);
    const key = `${lat.toFixed(5)}|${lng.toFixed(5)}`;

    if (!map.has(key)) {
      const group = { lat, lng, orders: [] };
      map.set(key, group);
      groupedOrders.push(group);
    }

    map.get(key).orders.push(order);
  }

  return groupedOrders;
}

/** Converts location groups into the `shipments` array expected by Google. */
function buildShipmentsFromGroups(groups) {
  return groups.map((group, index) => ({
    label: `shipment-${index}`,
    deliveries: [
      {
        arrivalLocation: {
          latitude: group.lat,
          longitude: group.lng,
        },
        duration: `${computeServiceSeconds(group.orders.length)}s`,
      },
    ],
  }));
}

/**
 * Builds two Maps for O(1) visit → group resolution from the optimizer response:
 *   byIndex  — shipmentIndex (number) → group
 *   byLabel  — shipmentLabel (string) → { index, group }
 */
function buildShipmentLookup(groups) {
  const byIndex = new Map();
  const byLabel = new Map();

  groups.forEach((group, index) => {
    byIndex.set(index, group);
    byLabel.set(`shipment-${index}`, { index, group });
  });

  return { byIndex, byLabel };
}

/**
 * Resolves a single optimizer `visit` object to the corresponding location group.
 * Tries shipmentIndex first, falls back to shipmentLabel.
 * Returns null when neither field resolves to a known shipment.
 */
function resolveVisitShipment(visit, shipmentLookup) {
  if (
    visit?.shipmentIndex !== undefined &&
    visit?.shipmentIndex !== null &&
    Number.isInteger(Number(visit.shipmentIndex)) &&
    shipmentLookup.byIndex.has(Number(visit.shipmentIndex))
  ) {
    const index = Number(visit.shipmentIndex);
    return { shipmentIndex: index, group: shipmentLookup.byIndex.get(index) };
  }

  if (
    typeof visit?.shipmentLabel === "string" &&
    shipmentLookup.byLabel.has(visit.shipmentLabel)
  ) {
    const resolved = shipmentLookup.byLabel.get(visit.shipmentLabel);
    return { shipmentIndex: resolved.index, group: resolved.group };
  }

  return null;
}

module.exports = {
  extractEncodedPolyline,
  computeServiceSeconds,
  groupOrdersByLocation,
  buildShipmentsFromGroups,
  buildShipmentLookup,
  resolveVisitShipment,
};
