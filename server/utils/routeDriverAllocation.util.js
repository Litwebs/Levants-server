/**
 * Driver configuration normalisation, validation, and postcode-area
 * order allocation for route generation.
 */

const {
  normalizeDriverRouting,
  parseUkPostcode,
  matchesRoutingArea,
} = require("./driverRouting.util");

const { isHHMM } = require("./routeValidation.util");

// ---------------------------------------------------------------------------
// Input normalisation
// ---------------------------------------------------------------------------

/**
 * Deduplicates driver IDs collected from either a plain `driverIds` array or
 * a `driverConfigs` array (which may carry additional per-driver settings).
 */
function normalizeDriverSelection({ driverIds, driverConfigs }) {
  const idSet = new Set();

  if (Array.isArray(driverIds)) {
    for (const driverId of driverIds) {
      const next = String(driverId || "").trim();
      if (next) idSet.add(next);
    }
  }

  if (Array.isArray(driverConfigs)) {
    for (const config of driverConfigs) {
      const next = String(config?.driverId || "").trim();
      if (next) idSet.add(next);
    }
  }

  return Array.from(idSet);
}

/** Indexes request-time driver configs by driverId for O(1) lookup. */
function buildRequestedDriverConfigMap(driverConfigs) {
  const byDriverId = new Map();

  for (const config of Array.isArray(driverConfigs) ? driverConfigs : []) {
    const driverId = String(config?.driverId || "").trim();
    if (!driverId) continue;
    byDriverId.set(driverId, normalizeDriverRouting(config));
  }

  return byDriverId;
}

/** Indexes manual order-to-driver assignments by orderDbId. */
function buildManualAssignmentMap(manualAssignments) {
  const byOrderId = new Map();

  for (const assignment of Array.isArray(manualAssignments)
    ? manualAssignments
    : []) {
    const orderDbId = String(assignment?.orderDbId || "").trim();
    const driverId = String(assignment?.driverId || "").trim();
    if (!orderDbId || !driverId) continue;
    byOrderId.set(orderDbId, driverId);
  }

  return byOrderId;
}

/** Returns a Map of driverId → count of manually assigned orders. */
function countManualAssignmentsByDriver(manualAssignmentMap) {
  const counts = new Map();

  for (const driverId of manualAssignmentMap.values()) {
    counts.set(driverId, (counts.get(driverId) || 0) + 1);
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Effective config building
// ---------------------------------------------------------------------------

/**
 * Merges each driver's persisted routing settings with any request-time
 * overrides.  Request-time postcodeAreas replace persisted ones entirely
 * (not merged) to avoid unintentional combinations.
 */
function buildEffectiveDriverConfigs({
  drivers,
  requestedConfigs,
  fallbackStartTime,
}) {
  return drivers.map((driver) => {
    const driverId = String(driver._id);
    const persisted = normalizeDriverRouting(driver.driverRouting || {});
    const override = requestedConfigs.get(driverId);

    const merged = normalizeDriverRouting({
      postcodeAreas:
        Array.isArray(override?.postcodeAreas) &&
        override.postcodeAreas.length > 0
          ? override.postcodeAreas
          : persisted.postcodeAreas,
      routeStartTime:
        override?.routeStartTime ||
        persisted.routeStartTime ||
        (typeof fallbackStartTime === "string" &&
        isHHMM(fallbackStartTime.trim())
          ? fallbackStartTime.trim()
          : null),
    });

    return {
      driverId,
      driver,
      postcodeAreas: merged.postcodeAreas,
      routeStartTime: merged.routeStartTime,
    };
  });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Returns an error array for any driver that is missing postcode areas or a
 * valid route start time.  A driver with exclusively manual assignments is not
 * required to have postcode areas.
 */
function validateDriverConfigs(
  driverConfigs,
  manualAssignmentCounts = new Map(),
) {
  const errors = [];

  for (const config of driverConfigs) {
    const manualAssignmentsCount = Number(
      manualAssignmentCounts.get(config.driverId) || 0,
    );

    if (
      !Array.isArray(config.postcodeAreas) ||
      (config.postcodeAreas.length === 0 && manualAssignmentsCount === 0)
    ) {
      errors.push({
        type: "DRIVER_POSTCODE_AREAS_MISSING",
        driverId: config.driverId,
        message:
          manualAssignmentsCount > 0
            ? `${config.driver.name} needs postcode areas for any auto-assigned stops`
            : `${config.driver.name} has no assigned postcode areas`,
      });
    }

    if (!config.routeStartTime || !isHHMM(config.routeStartTime)) {
      errors.push({
        type: "DRIVER_START_TIME_MISSING",
        driverId: config.driverId,
        message: `${config.driver.name} has no valid route start time`,
      });
    }
  }

  return errors;
}

/**
 * Validates that every manual assignment references a real order in the batch
 * and a driver that is part of the current selection.
 */
function validateManualAssignments({
  manualAssignmentMap,
  driverConfigs,
  orders,
}) {
  const errors = [];
  const driverIds = new Set(driverConfigs.map((config) => config.driverId));
  const orderIds = new Set(orders.map((order) => String(order._id)));

  for (const [orderDbId, driverId] of manualAssignmentMap.entries()) {
    if (!orderIds.has(orderDbId)) {
      errors.push({
        type: "MANUAL_ASSIGNMENT_ORDER_INVALID",
        orderDbId,
        driverId,
        message: `Manual assignment references an order that is not in this batch: ${orderDbId}`,
      });
    }

    if (!driverIds.has(driverId)) {
      errors.push({
        type: "MANUAL_ASSIGNMENT_DRIVER_INVALID",
        orderDbId,
        driverId,
        message: `Manual assignment references a driver that is not selected: ${driverId}`,
      });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

/**
 * Assigns each order to a driver bucket:
 *   1. Manual assignments take priority.
 *   2. Auto-assignment matches the order's outward postcode to a driver's areas.
 *      Ambiguous (multiple matches) or unmatched orders become warnings.
 */
function allocateOrdersByDriverPostcode({
  orders,
  driverConfigs,
  manualAssignmentMap,
}) {
  const buckets = new Map(driverConfigs.map((config) => [config.driverId, []]));
  const warnings = [];
  const assignedOrderIds = new Set();
  const driverConfigById = new Map(
    driverConfigs.map((config) => [config.driverId, config]),
  );

  for (const order of orders) {
    const orderDbId = String(order._id);
    const manuallyAssignedDriverId = manualAssignmentMap.get(orderDbId);

    if (manuallyAssignedDriverId) {
      const selectedDriver = driverConfigById.get(manuallyAssignedDriverId);
      if (selectedDriver) {
        buckets.get(selectedDriver.driverId).push(order);
        assignedOrderIds.add(orderDbId);
        continue;
      }
    }

    const postcodeValue = String(order?.deliveryAddress?.postcode || "").trim();
    const parsedPostcode = parseUkPostcode(postcodeValue);

    if (!parsedPostcode.compact || !parsedPostcode.isValid) {
      warnings.push({
        type: "BAD_ADDRESS",
        message: `Order ${order.orderId} has an invalid or missing delivery postcode`,
        orderId: String(order.orderId || ""),
        orderDbId: String(order._id),
        postcode: postcodeValue,
      });
      continue;
    }

    const matches = driverConfigs.filter((config) =>
      config.postcodeAreas.some((area) =>
        matchesRoutingArea(parsedPostcode, area),
      ),
    );

    if (matches.length === 0) {
      warnings.push({
        type: "NO_DRIVER_MATCH",
        message: `Order ${order.orderId} postcode ${parsedPostcode.outward} does not match any selected driver`,
        orderId: String(order.orderId || ""),
        orderDbId: String(order._id),
        postcode: postcodeValue,
      });
      continue;
    }

    if (matches.length > 1) {
      warnings.push({
        type: "MULTIPLE_DRIVER_MATCH",
        message: `Order ${order.orderId} postcode ${parsedPostcode.outward} matches multiple drivers`,
        orderId: String(order.orderId || ""),
        orderDbId: String(order._id),
        postcode: postcodeValue,
        driverIds: matches.map((match) => match.driverId),
      });
      continue;
    }

    const selectedDriver = matches[0];
    buckets.get(selectedDriver.driverId).push(order);
    assignedOrderIds.add(String(order._id));
  }

  return {
    buckets: driverConfigs.map((config) => ({
      ...config,
      orders: buckets.get(config.driverId) || [],
    })),
    warnings,
    assignedOrderIds,
    unassignedOrders: orders.filter(
      (order) => !assignedOrderIds.has(String(order._id)),
    ),
  };
}

module.exports = {
  normalizeDriverSelection,
  buildRequestedDriverConfigMap,
  buildManualAssignmentMap,
  countManualAssignmentsByDriver,
  buildEffectiveDriverConfigs,
  validateDriverConfigs,
  validateManualAssignments,
  allocateOrdersByDriverPostcode,
};
