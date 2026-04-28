"use strict";

const mongoose = require("mongoose");
const DeliveryBatch = require("../../models/deliveryBatch.model");
const Order = require("../../models/order.model");
const Customer = require("../../models/customer.model");
const ProductVariant = require("../../models/variant.model");
const Route = require("../../models/route.model");
const Stop = require("../../models/stop.model");
const { geocodeAddress } = require("../../Integration/google.geocode");
const {
  buildManualRow,
  parseSkuQtyList,
  parseMoney,
  parsePaidFlag,
  generateOrderId,
  splitName,
} = require("../../utils/deliveryImport.util");
const {
  isDriverUser,
  getUserId,
  normalizeDateRange,
} = require("../../utils/deliveryHelpers.util");

/**
 * Create a delivery batch for a specific date
 */
async function createDeliveryBatch({
  deliveryDate,
  orderIds,
  deliveryWindowStart,
  deliveryWindowEnd,
  ordersSheet,
} = {}) {
  if (!deliveryDate) {
    return { success: false, message: "deliveryDate is required" };
  }

  const startTime =
    typeof deliveryWindowStart === "string" && deliveryWindowStart.trim()
      ? deliveryWindowStart.trim()
      : undefined;
  const endTime =
    typeof deliveryWindowEnd === "string" && deliveryWindowEnd.trim()
      ? deliveryWindowEnd.trim()
      : undefined;

  const hhmm = /^\d{2}:\d{2}$/;
  if (startTime && !hhmm.test(startTime)) {
    return { success: false, message: "startTime must be in HH:mm format" };
  }
  if (endTime && !hhmm.test(endTime)) {
    return { success: false, message: "endTime must be in HH:mm format" };
  }

  const date = new Date(deliveryDate);

  if (Number.isNaN(date.getTime())) {
    return { success: false, message: "Invalid deliveryDate" };
  }

  // Normalize to start of day (UTC)
  const startOfDay = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );

  const endOfDay = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );

  // Prevent duplicate batch
  const existingBatch = await DeliveryBatch.findOne({
    deliveryDate: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  });

  if (existingBatch) {
    return {
      success: false,
      message: "Batch already exists for this delivery date",
    };
  }

  const hasSpreadsheet = Boolean(
    ordersSheet &&
    Array.isArray(ordersSheet.rows) &&
    ordersSheet.rows.length > 0,
  );

  // Find eligible orders
  let selectedOrderIds = [];

  if (Array.isArray(orderIds) && orderIds.length > 0) {
    const unique = Array.from(new Set(orderIds.map((id) => String(id))));
    const validIds = unique.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return { success: false, message: "orderIds must contain valid IDs" };
    }

    const found = await Order.find({
      _id: { $in: validIds },
      status: "paid",
      deliveryDate: { $gte: startOfDay, $lte: endOfDay },
    }).select("_id");

    if (found.length !== validIds.length) {
      return {
        success: false,
        message: "Some selected orders are not eligible for this date",
      };
    }

    selectedOrderIds = found.map((o) => o._id);
  } else if (!hasSpreadsheet) {
    const eligibleOrders = await Order.find({
      deliveryDate: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      status: "paid",
    }).select("_id");

    if (eligibleOrders.length === 0) {
      return {
        success: false,
        message: "No eligible orders found for this date",
      };
    }

    selectedOrderIds = eligibleOrders.map((o) => o._id);
  } else {
    // Spreadsheet provided: do NOT default to all paid orders.
    selectedOrderIds = [];
  }

  // Manual import from spreadsheet rows
  let importMeta;
  let createdOrderIds = [];
  if (hasSpreadsheet) {
    // For XLSX (Option A) we only support the manual row format.
    // If the file isn't in the expected shape, fail clearly.
    const manualRows = ordersSheet.rows
      .map(buildManualRow)
      .filter((r) => r.name || r.address || r.postcode || r.orderCell);

    const usable = manualRows.filter(
      (r) => r.address && r.postcode && r.orderCell,
    );
    if (usable.length === 0) {
      const first = ordersSheet.rows?.[0];
      const headers =
        first && typeof first === "object" ? Object.keys(first) : [];
      return {
        success: false,
        message: `Uploaded sheet has no usable rows. Expected columns like name, address, postcode, order. Detected headers: ${headers
          .slice(0, 20)
          .join(", ")}`,
      };
    }

    const allSkuLower = Array.from(
      new Set(
        usable
          .flatMap((r) =>
            parseSkuQtyList(r.orderCell).map((x) =>
              String(x.sku).toLowerCase(),
            ),
          )
          .filter(Boolean),
      ),
    );

    const variantRows = allSkuLower.length
      ? await ProductVariant.aggregate([
          {
            $project: {
              _id: 1,
              product: 1,
              name: 1,
              sku: 1,
              price: 1,
              status: 1,
              lowerSku: { $toLower: "$sku" },
            },
          },
          { $match: { status: "active", lowerSku: { $in: allSkuLower } } },
        ])
      : [];

    const variantsByLowerSku = new Map(
      (variantRows || []).map((v) => [String(v.lowerSku), v]),
    );

    const missingSkus = [];
    for (const skuLower of allSkuLower) {
      if (!variantsByLowerSku.has(String(skuLower))) missingSkus.push(skuLower);
    }
    if (missingSkus.length) {
      return {
        success: false,
        message: `Some SKUs from the uploaded sheet do not exist or are inactive: ${missingSkus
          .slice(0, 10)
          .join(", ")}`,
      };
    }

    // Geocode before transaction; fail with a clear message if any row can't be geocoded.
    const geocoded = await Promise.all(
      usable.map(async (r) => {
        const deliveryAddress = {
          line1: r.address,
          line2: null,
          city: "Unknown",
          postcode: r.postcode,
          country: "UK",
        };
        try {
          const location = await geocodeAddress(deliveryAddress);
          return { ok: true, deliveryAddress, location };
        } catch (e) {
          return { ok: false, deliveryAddress, error: e };
        }
      }),
    );

    const failedGeocode = geocoded
      .map((g, idx) => ({ g, idx }))
      .filter((x) => !x.g?.ok);
    if (failedGeocode.length) {
      const sample = failedGeocode
        .slice(0, 5)
        .map(({ idx }) => usable[idx]?.postcode || `row:${idx + 2}`)
        .join(", ");
      return {
        success: false,
        message: `Some rows could not be geocoded. Sample: ${sample}`,
      };
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const now = new Date();
      const reservationExpiresAt = new Date(
        now.getTime() + 365 * 24 * 60 * 60 * 1000,
      );

      for (let i = 0; i < usable.length; i++) {
        const row = usable[i];
        const geo = geocoded[i];

        const skuQty = parseSkuQtyList(row.orderCell);

        const resolvedItems = [];
        let subtotal = 0;

        for (const it of skuQty) {
          const v = variantsByLowerSku.get(String(it.sku).toLowerCase());
          if (!v) continue;

          const quantity = Number(it.qty);
          const price = Number(v.price) || 0;
          const lineSubtotal = price * quantity;

          resolvedItems.push({
            product: v.product,
            variant: v._id,
            name: v.name,
            sku: v.sku,
            price,
            quantity,
            subtotal: lineSubtotal,
          });
          subtotal += lineSubtotal;
        }

        if (!resolvedItems.length) {
          throw new Error("Imported row has no resolvable items");
        }

        const { firstName, lastName } = splitName(row.name);
        const providedEmail = String(row.email || "")
          .trim()
          .toLowerCase();

        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const email = providedEmail || `manual-${unique}@import.local`;

        const [customer] = await Customer.create(
          [
            {
              email,
              firstName,
              lastName,
              phone: row.contact || null,
              isGuest: true,
              addresses: [
                {
                  line1: geo.deliveryAddress.line1,
                  line2: geo.deliveryAddress.line2,
                  city: geo.deliveryAddress.city,
                  postcode: geo.deliveryAddress.postcode,
                  country: geo.deliveryAddress.country,
                  isDefault: true,
                },
              ],
            },
          ],
          { session },
        );

        const deliveryFee = parseMoney(row.deliveryFee);
        const computedTotal = subtotal + deliveryFee;
        const providedTotal = parseMoney(row.total);
        const total = providedTotal > 0 ? providedTotal : computedTotal;

        const paidFlag = parsePaidFlag(row.paid);
        const isPaid = paidFlag === null ? true : paidFlag;

        const [order] = await Order.create(
          [
            {
              orderId: generateOrderId(),
              customer: customer._id,
              items: resolvedItems,
              currency: "GBP",
              subtotal,
              deliveryFee,
              total,
              totalBeforeDiscount: computedTotal,
              discountAmount: 0,
              isDiscounted: false,
              status: isPaid ? "paid" : "unpaid",
              paidAt: isPaid ? now : undefined,
              reservationExpiresAt,
              deliveryDate: startOfDay,
              deliveryAddress: geo.deliveryAddress,
              location: geo.location,
              metadata: {
                manualImport: true,
                importSource: "spreadsheet",
                importOriginalName: ordersSheet.originalName,
                importRow: row,
              },
            },
          ],
          { session },
        );

        createdOrderIds.push(order._id);
      }

      // Merge with selected DB orders
      const merged = new Set(selectedOrderIds.map((id) => String(id)));
      for (const id of createdOrderIds) merged.add(String(id));
      selectedOrderIds = Array.from(merged);

      // Create the batch inside the same transaction so imports are atomic.
      const [batch] = await DeliveryBatch.create(
        [
          {
            deliveryDate: startOfDay,
            status: "locked",
            orders: selectedOrderIds,
            lockedAt: new Date(),
            deliveryWindowStart: startTime,
            deliveryWindowEnd: endTime,
            orderImport: {
              originalName: ordersSheet.originalName,
              mimeType: ordersSheet.mimeType,
              sizeBytes: ordersSheet.sizeBytes,
              detectedType: ordersSheet.detectedType,
              uploadedBy: ordersSheet.uploadedBy,
              uploadedAt: new Date(),
              rowsCount: ordersSheet.rows.length,
              createdOrdersCount: createdOrderIds.length,
            },
          },
        ],
        { session },
      );

      await session.commitTransaction();
      session.endSession();

      return {
        success: true,
        data: {
          batchId: batch._id,
          totalOrders: selectedOrderIds.length,
          importedOrders: createdOrderIds.length,
        },
      };
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      console.error("Manual import failed:", err);
      return {
        success: false,
        message:
          err && typeof err.message === "string" && err.message.trim()
            ? err.message
            : "Failed to import orders from spreadsheet",
      };
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [batch] = await DeliveryBatch.create(
      [
        {
          deliveryDate: startOfDay,
          status: "locked",
          orders: selectedOrderIds,
          lockedAt: new Date(),
          deliveryWindowStart: startTime,
          deliveryWindowEnd: endTime,
          ...(importMeta ? { orderImport: importMeta } : {}),
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    return {
      success: true,
      data: {
        batchId: batch._id,
        totalOrders: selectedOrderIds.length,
      },
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error creating delivery batch:", err);

    return {
      success: false,
      message: "Failed to create delivery batch",
    };
  }
}

async function listBatches({ fromDate, toDate, status, user } = {}) {
  try {
    const filter = {};
    const dateRange = normalizeDateRange({ fromDate, toDate });
    if (dateRange) filter.deliveryDate = dateRange;

    if (status && status !== "all") {
      filter.status = status;
    }

    const batches = await DeliveryBatch.find(filter)
      .sort({ deliveryDate: -1, createdAt: -1 })
      .populate({
        path: "routes",
        populate: { path: "driver", select: "name email" },
      })
      .lean();

    const userId = getUserId(user);
    const driverScoped = isDriverUser(user) && Boolean(userId);

    const scopedBatches = driverScoped
      ? batches
          .map((b) => {
            const allRoutes = Array.isArray(b.routes) ? b.routes : [];
            const routes = allRoutes.filter((r) => {
              const driver = r?.driver;
              const driverId = driver
                ? String(
                    typeof driver === "string"
                      ? driver
                      : driver._id || driver.id || "",
                  )
                : "";
              return driverId && driverId === userId;
            });
            return { ...b, routes };
          })
          .filter((b) => (Array.isArray(b.routes) ? b.routes.length : 0) > 0)
      : batches;

    const items = scopedBatches.map((b) => {
      const routes = Array.isArray(b.routes) ? b.routes : [];

      const distanceKm =
        routes.reduce((sum, r) => sum + (r?.totalDistanceMeters || 0), 0) /
        1000;
      const durationMin =
        routes.reduce((sum, r) => sum + (r?.totalDurationSeconds || 0), 0) / 60;

      const dropsCount = routes.reduce(
        (sum, r) => sum + (r?.totalStops || 0),
        0,
      );
      const ordersCount = driverScoped
        ? dropsCount
        : Array.isArray(b.orders)
          ? b.orders.length
          : 0;

      return {
        id: b._id,
        deliveryDate: b.deliveryDate,
        status: b.status,
        ordersCount,
        dropsCount,
        unassignedCount: driverScoped
          ? 0
          : Math.max(0, ordersCount - dropsCount),
        distanceKm,
        durationMin,
        lastOptimizedAt: b.generatedAt || null,
      };
    });

    return { success: true, data: { batches: items } };
  } catch (err) {
    console.error("List batches error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to list batches",
    };
  }
}

async function listEligibleOrders({ deliveryDate } = {}) {
  try {
    if (!deliveryDate) {
      return {
        success: false,
        statusCode: 400,
        message: "deliveryDate is required",
      };
    }

    const date = new Date(deliveryDate);
    if (Number.isNaN(date.getTime())) {
      return {
        success: false,
        statusCode: 400,
        message: "Invalid deliveryDate",
      };
    }

    const startOfDay = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );

    const endOfDay = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );

    const orders = await Order.find({
      deliveryDate: { $gte: startOfDay, $lte: endOfDay },
      status: "paid",
    })
      .populate("customer", "firstName lastName phone")
      .select("orderId deliveryAddress location items")
      .sort({ createdAt: -1 })
      .lean();

    const mapped = orders.map((o) => ({
      id: o._id,
      orderId: o.orderId,
      customerName:
        o.customer && typeof o.customer === "object"
          ? `${o.customer.firstName || ""} ${o.customer.lastName || ""}`.trim()
          : "",
      phone:
        o.customer && typeof o.customer === "object" ? o.customer.phone : null,
      postcode: o.deliveryAddress?.postcode || "",
      addressLine1: o.deliveryAddress?.line1 || "",
      lat: o.location?.lat,
      lng: o.location?.lng,
      totalItems: Array.isArray(o.items)
        ? o.items.reduce((sum, it) => sum + (it?.quantity || 0), 0)
        : 0,
    }));

    return { success: true, data: { orders: mapped } };
  } catch (err) {
    console.error("List eligible orders error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to list eligible orders",
    };
  }
}

async function lockBatch({ batchId } = {}) {
  if (!batchId)
    return { success: false, statusCode: 400, message: "batchId is required" };
  const batch = await DeliveryBatch.findById(batchId);
  if (!batch)
    return { success: false, statusCode: 404, message: "Batch not found" };
  batch.status = "locked";
  batch.lockedAt = new Date();
  await batch.save();
  return {
    success: true,
    data: {
      batchId: batch._id,
      status: batch.status,
      lockedAt: batch.lockedAt,
    },
  };
}

async function unlockBatch({ batchId } = {}) {
  if (!batchId)
    return { success: false, statusCode: 400, message: "batchId is required" };
  const batch = await DeliveryBatch.findById(batchId);
  if (!batch)
    return { success: false, statusCode: 404, message: "Batch not found" };
  batch.status = "collecting";
  batch.lockedAt = null;
  await batch.save();
  return { success: true, data: { batchId: batch._id, status: batch.status } };
}

/**
 * Delete a delivery batch and cascade-delete associated routes + stops.
 */
async function deleteBatch({ batchId } = {}) {
  try {
    if (!batchId || !mongoose.Types.ObjectId.isValid(String(batchId))) {
      return { success: false, statusCode: 400, message: "Invalid batchId" };
    }

    const existing = await DeliveryBatch.findById(batchId).select("_id").lean();
    if (!existing) {
      return { success: false, statusCode: 404, message: "Batch not found" };
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const routes = await Route.find({ batch: batchId })
        .select("_id")
        .session(session)
        .lean();

      const routeIds = routes.map((r) => r._id);

      if (routeIds.length > 0) {
        await Stop.deleteMany({ route: { $in: routeIds } }).session(session);
        await Route.deleteMany({ _id: { $in: routeIds } }).session(session);
      }

      await DeliveryBatch.deleteOne({ _id: batchId }).session(session);

      await session.commitTransaction();
      session.endSession();

      return { success: true };
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (err) {
    console.error("Delete batch error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to delete delivery batch",
    };
  }
}

module.exports = {
  createDeliveryBatch,
  listBatches,
  listEligibleOrders,
  lockBatch,
  unlockBatch,
  deleteBatch,
};
