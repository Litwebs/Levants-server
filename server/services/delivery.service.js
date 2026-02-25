const mongoose = require("mongoose");
const DeliveryBatch = require("../models/deliveryBatch.model");
const Order = require("../models/order.model");
const Customer = require("../models/customer.model");
const ProductVariant = require("../models/variant.model");
const User = require("../models/user.model");
const Role = require("../models/role.model");

const Route = require("../models/route.model");
const Stop = require("../models/stop.model");

const { generateRoutesForBatch } = require("./route.service");
const { getRouteStockAggregation } = require("./warehouse.service");
const { generateGoogleMapsLink } = require("../utils/navigation.util");
const { normalizeKey } = require("../utils/ordersSpreadsheet.util");
const { geocodeAddress } = require("../Integration/google.geocode");

const sanitizeSku = (raw) => {
  if (typeof raw !== "string") return "";
  let s = raw.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  s = s.replace(/^['"`]+|['"`]+$/g, "");
  s = s.replace(/[.]+$/g, "");
  return s.trim();
};

const parseSkuQtyList = (cell) => {
  if (typeof cell !== "string") return [];
  const raw = cell.trim();
  if (!raw) return [];

  const parts = raw
    .split(/[\n,;|]+/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const items = [];
  for (const partRaw of parts) {
    const m = partRaw.match(/^\s*(\d+)\s*[xX]\s*(.+)\s*$/);
    if (m) {
      const qty = Number(m[1]);
      const sku = sanitizeSku(
        String(m[2] || "")
          .trim()
          .split(/\s+/g)[0],
      );
      if (sku && Number.isFinite(qty) && qty > 0) items.push({ sku, qty });
      continue;
    }
    const sku = sanitizeSku(partRaw.trim().split(/\s+/g)[0]);
    if (sku) items.push({ sku, qty: 1 });
  }

  const map = new Map();
  for (const it of items) {
    const key = String(it.sku).toLowerCase();
    map.set(key, { sku: it.sku, qty: (map.get(key)?.qty || 0) + it.qty });
  }
  return Array.from(map.values());
};

const parseMoney = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v || "").replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const generateOrderId = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${date}-${random}`;
};

const splitName = (n) => {
  const s = String(n || "").trim();
  if (!s) return { firstName: "Manual", lastName: "Customer" };
  const parts = s.split(/\s+/g).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: "Customer" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
};

const isUkPostcode = (v) => {
  const s = String(v || "")
    .trim()
    .toUpperCase();
  if (!s) return false;
  const compact = s.replace(/\s+/g, "");
  return /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact);
};

const inferPostcodeFromRow = (obj) => {
  if (!obj || typeof obj !== "object") return "";
  for (const v of Object.values(obj)) {
    if (isUkPostcode(v)) return String(v).trim();
  }
  return "";
};

const inferOrderCellFromRow = (obj) => {
  if (!obj || typeof obj !== "object") return "";
  const values = Object.values(obj)
    .map((v) =>
      typeof v === "string" || typeof v === "number" ? String(v).trim() : "",
    )
    .filter(Boolean);

  let best = "";
  let bestScore = 0;
  for (const val of values) {
    const qtyMatches = (val.match(/\b\d+\s*[xX]\s*[^,;|\n]+/g) || []).length;
    const hasSeparators = /[\n,;|]/.test(val) ? 1 : 0;
    const tokenish = (val.match(/[A-Za-z0-9][A-Za-z0-9_-]{2,}/g) || []).length;
    const score = qtyMatches * 10 + hasSeparators * 2 + tokenish;
    if (score > bestScore) {
      bestScore = score;
      best = val;
    }
  }

  if (bestScore >= 10) return best;

  // Multi-SKU lists without quantities.
  for (const val of values) {
    const parts = val
      .split(/[\n,;|]+/g)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) continue;
    const ok = parts.every((p) => {
      const stripped = p.replace(/^\s*\d+\s*[xX]\s*/g, "").trim();
      if (!stripped) return false;
      if (isUkPostcode(stripped)) return false;
      return /^[A-Za-z0-9][A-Za-z0-9_-]{2,}$/.test(stripped);
    });
    if (ok) return val;
  }

  return "";
};

const inferAddressFromRow = (obj) => {
  if (!obj || typeof obj !== "object") return "";
  const values = Object.values(obj)
    .map((v) =>
      typeof v === "string" || typeof v === "number" ? String(v).trim() : "",
    )
    .filter(Boolean);

  const candidates = values.filter((v) => {
    if (isUkPostcode(v)) return false;
    if (/^\+?\d[\d\s()-]{6,}$/.test(v)) return false;
    if (/\b\d+\s*[xX]\b/.test(v)) return false;
    return /\d/.test(v) && /[A-Za-z]/.test(v) && v.length >= 8;
  });

  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] || "";
};

const buildManualRow = (obj) => {
  if (!obj || typeof obj !== "object") {
    return {
      name: "",
      address: "",
      postcode: "",
      contact: "",
      orderCell: "",
      deliveryFee: "",
      total: "",
      _raw: obj,
    };
  }

  const byNorm = new Map(
    Object.entries(obj).map(([k, v]) => [normalizeKey(k), v]),
  );

  const pick = (keys) => {
    for (const k of keys.map(normalizeKey)) {
      if (byNorm.has(k)) return byNorm.get(k);
    }
    return undefined;
  };

  const str = (v) =>
    typeof v === "string" || typeof v === "number" ? String(v).trim() : "";

  const name = str(pick(["name", "customer", "customername"]));
  const address = str(
    pick([
      "address",
      "address1",
      "deliveryaddress",
      "deliveryaddress1",
      "shippingaddress",
      "shippingaddress1",
    ]),
  );
  const postcode = str(
    pick([
      "postcode",
      "post code",
      "post_code",
      "zip",
      "zipcode",
      "postalcode",
    ]),
  );
  const contact = str(pick(["contact", "phone", "telephone", "mobile"]));
  const orderCell = str(
    pick(["order", "orders", "items", "item", "products", "basket", "cart"]),
  );
  const deliveryFee = str(
    pick(["deliveryfee", "delivery fee", "shipping", "delivery"]),
  );
  const total = str(pick(["total", "amount", "ordertotal"]));

  return {
    name,
    address: address || inferAddressFromRow(obj),
    postcode: postcode || inferPostcodeFromRow(obj),
    contact,
    orderCell: orderCell || inferOrderCellFromRow(obj),
    deliveryFee,
    total,
    _raw: obj,
  };
};

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
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const email = `manual-${unique}@import.local`;

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
              status: "paid",
              paidAt: now,
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

function normalizeDateRange({ fromDate, toDate } = {}) {
  const filter = {};
  if (fromDate) {
    const d = new Date(fromDate);
    if (!Number.isNaN(d.getTime())) {
      filter.$gte = new Date(
        Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate(),
          0,
          0,
          0,
          0,
        ),
      );
    }
  }
  if (toDate) {
    const d = new Date(toDate);
    if (!Number.isNaN(d.getTime())) {
      filter.$lte = new Date(
        Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate(),
          23,
          59,
          59,
          999,
        ),
      );
    }
  }
  return Object.keys(filter).length ? filter : null;
}

async function listBatches({ fromDate, toDate, status } = {}) {
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

    const items = batches.map((b) => {
      const routes = Array.isArray(b.routes) ? b.routes : [];
      const distanceKm =
        routes.reduce((sum, r) => sum + (r?.totalDistanceMeters || 0), 0) /
        1000;
      const durationMin =
        routes.reduce((sum, r) => sum + (r?.totalDurationSeconds || 0), 0) / 60;

      return {
        id: b._id,
        deliveryDate: b.deliveryDate,
        status: b.status,
        ordersCount: Array.isArray(b.orders) ? b.orders.length : 0,
        dropsCount: routes.reduce((sum, r) => sum + (r?.totalStops || 0), 0),
        unassignedCount: Math.max(
          0,
          (Array.isArray(b.orders) ? b.orders.length : 0) -
            routes.reduce((sum, r) => sum + (r?.totalStops || 0), 0),
        ),
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

async function listDrivers() {
  try {
    const driverRole = await Role.findOne({ name: "driver" }).select("_id");
    if (!driverRole) {
      return { success: true, data: { drivers: [] } };
    }

    const drivers = await User.find({ role: driverRole._id, status: "active" })
      .select("name email")
      .sort({ name: 1 })
      .lean();

    return {
      success: true,
      data: {
        drivers: drivers.map((d) => ({
          id: d._id,
          name: d.name,
          email: d.email,
        })),
      },
    };
  } catch (err) {
    console.error("List drivers error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to list drivers",
    };
  }
}

async function getDepot() {
  const lat = Number(process.env.WAREHOUSE_LAT);
  const lng = Number(process.env.WAREHOUSE_LNG);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return {
      success: false,
      statusCode: 500,
      message: "WAREHOUSE_LAT/WAREHOUSE_LNG are not configured",
    };
  }

  return {
    success: true,
    data: {
      lat,
      lng,
      label: "Depot",
    },
  };
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

async function dispatchBatch({ batchId } = {}) {
  if (!batchId)
    return { success: false, statusCode: 400, message: "batchId is required" };
  const batch = await DeliveryBatch.findById(batchId);
  if (!batch)
    return { success: false, statusCode: 404, message: "Batch not found" };
  batch.status = "dispatched";
  batch.dispatchedAt = new Date();
  await batch.save();
  return { success: true, data: { batchId: batch._id, status: batch.status } };
}

async function generateRoutes({ batchId, driverIds, startTime, endTime } = {}) {
  try {
    const result = await generateRoutesForBatch({
      batchId,
      driverIds,
      startTime,
      endTime,
    });
    if (!result.success) {
      return {
        success: false,
        statusCode: 400,
        message: result.message || "Failed to generate routes",
        data: result.data,
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (err) {
    console.error("Generate routes error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to generate routes",
    };
  }
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

async function getBatch({ batchId } = {}) {
  try {
    if (!batchId) {
      return {
        success: false,
        statusCode: 400,
        message: "batchId is required",
      };
    }

    const batch = await DeliveryBatch.findById(batchId)
      .populate({
        path: "orders",
        populate: { path: "customer", select: "firstName lastName phone" },
      })
      .populate({
        path: "routes",
        populate: {
          path: "driver",
          select: "name email",
        },
      });

    if (!batch) {
      return { success: false, statusCode: 404, message: "Batch not found" };
    }

    return {
      success: true,
      data: batch,
    };
  } catch (err) {
    console.error("Get batch error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to fetch batch",
    };
  }
}

async function getRoute({ routeId } = {}) {
  try {
    if (!routeId) {
      return {
        success: false,
        statusCode: 400,
        message: "routeId is required",
      };
    }

    const route = await Route.findById(routeId)
      .populate("driver", "name email")
      .lean();

    if (!route) {
      return { success: false, statusCode: 404, message: "Route not found" };
    }

    const stops = await Stop.find({ route: routeId })
      .sort({ sequence: 1 })
      .populate({
        path: "order",
        populate: { path: "customer", select: "firstName lastName phone" },
      })
      .lean();

    const enrichedStops = stops.map((stop) => ({
      ...stop,
      navigationUrl:
        stop?.order?.location?.lat != null && stop?.order?.location?.lng != null
          ? generateGoogleMapsLink(
              stop.order.location.lat,
              stop.order.location.lng,
            )
          : null,
    }));

    return {
      success: true,
      data: {
        route,
        stops: enrichedStops,
      },
    };
  } catch (err) {
    console.error("Get route error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to fetch route",
    };
  }
}

async function getRouteStock({ routeId } = {}) {
  try {
    const result = await getRouteStockAggregation({ routeId });
    if (!result.success) {
      return {
        success: false,
        statusCode: 400,
        message: result.message || "Failed to generate stock list",
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (err) {
    console.error("Warehouse aggregation error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to generate stock list",
    };
  }
}

module.exports = {
  createDeliveryBatch,
  listBatches,
  listEligibleOrders,
  listDrivers,
  getDepot,
  lockBatch,
  unlockBatch,
  dispatchBatch,
  generateRoutes,
  getBatch,
  getRoute,
  getRouteStock,
  deleteBatch,
};
