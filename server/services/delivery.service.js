const mongoose = require("mongoose");
const DeliveryBatch = require("../models/deliveryBatch.model");
const Order = require("../models/order.model");
const Customer = require("../models/customer.model");
const ProductVariant = require("../models/variant.model");
const User = require("../models/user.model");
const Role = require("../models/role.model");

const Route = require("../models/route.model");
const Stop = require("../models/stop.model");

const { sendBatchEmails } = require("../Integration/Email.service");

const { generateRoutesForBatch } = require("./route.service");
const { getRouteStockAggregation } = require("./warehouse.service");
const { generateGoogleMapsLink } = require("../utils/navigation.util");
const { normalizeKey } = require("../utils/ordersSpreadsheet.util");
const { geocodeAddress } = require("../Integration/google.geocode");
const { normalizeDriverRouting } = require("../utils/driverRouting.util");

const chunkArray = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
};

const buildDispatchEmailSubject = (order) =>
  `Your order ${order?.orderId || ""} has been dispatched`;

const buildDispatchEmailJob = ({ order, batch, eta }) => {
  const customer = order?.customer;
  const to = String(customer?.email || "").trim();

  if (!to) {
    return {
      ok: false,
      reason: "missing_customer_email",
    };
  }

  let etaWindowStart = "";
  let etaWindowEnd = "";

  if (eta instanceof Date && Number.isFinite(eta.getTime())) {
    const start = roundToNearestMinutes(
      new Date(eta.getTime() - 60 * 60 * 1000),
      30,
    );
    const end = roundToNearestMinutes(
      new Date(eta.getTime() + 60 * 60 * 1000),
      30,
    );

    etaWindowStart = formatUkTime(start);
    etaWindowEnd = formatUkTime(end);
  }

  const deliveryDate =
    order?.deliveryDate instanceof Date
      ? order.deliveryDate
      : batch?.deliveryDate instanceof Date
        ? batch.deliveryDate
        : null;

  return {
    ok: true,
    job: {
      orderDbId: String(order._id),
      orderId: order.orderId,
      to,
      subject: buildDispatchEmailSubject(order),
      template: "orderDispatched",
      templateParams: {
        name: customer?.firstName || "there",
        orderId: order.orderId,
        deliveryDate: deliveryDate ? formatUkDate(deliveryDate) : "",
        etaWindowStart,
        etaWindowEnd,
      },
      options: {
        fromName: "Levants",
      },
      tags: [
        { name: "type", value: "order-dispatched" },
        { name: "orderId", value: String(order.orderId || "") },
      ],
    },
  };
};

async function claimOrdersForDispatchEmail(orderIds = []) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) return new Set();

  const claimedIds = new Set();

  for (const orderId of orderIds) {
    const claimed = await Order.findOneAndUpdate(
      {
        _id: orderId,
        deliveryStatus: { $nin: ["delivered", "returned"] },
        "metadata.dispatchedEmailSentAt": { $exists: false },
        "metadata.dispatchEmailClaimedAt": { $exists: false },
      },
      {
        $set: {
          "metadata.dispatchEmailClaimedAt": new Date(),
        },
      },
      {
        new: true,
      },
    )
      .select("_id")
      .lean();

    if (claimed?._id) {
      claimedIds.add(String(claimed._id));
    }
  }

  return claimedIds;
}

async function persistDispatchEmailResults(results = []) {
  if (!Array.isArray(results) || results.length === 0) {
    return {
      sent: 0,
      failed: 0,
      bulkResult: null,
    };
  }

  const now = new Date();
  const ops = [];

  let sent = 0;
  let failed = 0;

  for (const result of results) {
    if (!result?.orderDbId) continue;

    if (result.success) {
      sent += 1;

      ops.push({
        updateOne: {
          filter: { _id: result.orderDbId },
          update: {
            $set: {
              "metadata.dispatchedEmailSentAt": now,
              "metadata.dispatchedEmailProviderId": result.providerId || null,
            },
            $unset: {
              "metadata.dispatchEmailClaimedAt": "",
              "metadata.dispatchedEmailLastError": "",
            },
          },
        },
      });
    } else {
      failed += 1;

      ops.push({
        updateOne: {
          filter: { _id: result.orderDbId },
          update: {
            $set: {
              "metadata.dispatchedEmailLastError": {
                at: now,
                status: result?.error?.status ?? null,
                message: String(result?.error?.message || "Email send failed"),
              },
            },
            $unset: {
              "metadata.dispatchEmailClaimedAt": "",
            },
          },
        },
      });
    }
  }

  const bulkResult = ops.length ? await Order.bulkWrite(ops) : null;

  return {
    sent,
    failed,
    bulkResult,
  };
}

const isDriverUser = (user) => String(user?.role?.name || "") === "driver";

const LONDON_TZ = "Europe/London";

const roundToNearestMinutes = (date, minutes) => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  const stepMs = Number(minutes) * 60 * 1000;
  if (!Number.isFinite(stepMs) || stepMs <= 0) return null;
  return new Date(Math.round(date.getTime() / stepMs) * stepMs);
};

const formatUkTime = (date) => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LONDON_TZ,
  });
};

const formatUkDate = (date) => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: LONDON_TZ,
  });
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getEmailErrorStatus = (emailRes) => {
  const err = emailRes?.error;
  if (!err) return null;
  const status =
    err?.statusCode ?? err?.status ?? err?.code ?? emailRes?.statusCode;
  const n = Number(status);
  return Number.isFinite(n) ? n : null;
};

const getEmailErrorMessage = (emailRes) => {
  const err = emailRes?.error;
  if (!err) return "";
  if (typeof err === "string") return err;
  return String(err?.message || err?.name || "Email send failed");
};

const shouldRetryEmail = (status) => {
  // 429: rate limit; 5xx: transient provider errors
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500 && status <= 599) return true;
  return false;
};

const sendEmailWithRetry = async ({
  to,
  subject,
  template,
  params,
  options,
  maxAttempts = 3,
  minDelayMs = 600,
} = {}) => {
  let lastResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // Pace requests to respect provider rate limits (e.g. Resend free tier).
    if (attempt > 1) {
      await sleep(minDelayMs * Math.pow(2, attempt - 2));
    } else if (minDelayMs > 0) {
      await sleep(minDelayMs);
    }

    const res = await sendEmail(to, subject, template, params, options);
    lastResult = res;

    if (res?.success) return res;

    const status = getEmailErrorStatus(res);
    if (!shouldRetryEmail(status)) return res;
  }

  return (
    lastResult || { success: false, error: new Error("Email send failed") }
  );
};

const getUserId = (user) => {
  const id = user?._id || user?.id;
  return id ? String(id) : null;
};

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

const parsePaidFlag = (v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number" && Number.isFinite(v)) return v > 0;

  const s = String(v || "")
    .trim()
    .toLowerCase();

  if (!s) return null;

  if (["1", "y", "yes", "true", "paid"].includes(s)) return true;
  if (["0", "n", "no", "false", "unpaid", "pending"].includes(s)) return false;

  return null;
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
      email: "",
      address: "",
      postcode: "",
      contact: "",
      orderCell: "",
      deliveryFee: "",
      total: "",
      paid: "",
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
  const email = str(
    pick([
      "email",
      "e-mail",
      "emailaddress",
      "email address",
      "customeremail",
      "customer email",
    ]),
  );
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
  const total = str(
    pick(["total", "totalamount", "total amount", "amount", "ordertotal"]),
  );
  const paid = str(
    pick([
      "paid",
      "ispaid",
      "payment",
      "paymentstatus",
      "payment status",
      "paidstatus",
    ]),
  );

  return {
    name,
    email,
    address: address || inferAddressFromRow(obj),
    postcode: postcode || inferPostcodeFromRow(obj),
    contact,
    orderCell: orderCell || inferOrderCellFromRow(obj),
    deliveryFee,
    total,
    paid,
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

async function listDrivers() {
  try {
    const driverRole = await Role.findOne({ name: "driver" }).select("_id");
    if (!driverRole) {
      return { success: true, data: { drivers: [] } };
    }

    const drivers = await User.find({ role: driverRole._id, status: "active" })
      .select("name email driverRouting")
      .sort({ name: 1 })
      .lean();

    return {
      success: true,
      data: {
        drivers: drivers.map((d) => ({
          id: d._id,
          name: d.name,
          email: d.email,
          driverRouting: normalizeDriverRouting(d.driverRouting || {}),
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
  if (!batchId) {
    return {
      success: false,
      statusCode: 400,
      message: "batchId is required",
    };
  }

  const batch = await DeliveryBatch.findById(batchId);
  if (!batch) {
    return {
      success: false,
      statusCode: 404,
      message: "Batch not found",
    };
  }

  // Mark batch as dispatched (idempotent)
  const now = new Date();
  batch.status = "dispatched";
  if (!batch.dispatchedAt) batch.dispatchedAt = now;
  await batch.save();

  const orderIds = (Array.isArray(batch.orders) ? batch.orders : [])
    .map((id) => String(id))
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  let ordersUpdatedCount = 0;

  if (orderIds.length > 0) {
    const updateRes = await Order.updateMany(
      {
        _id: { $in: orderIds },
        deliveryStatus: { $nin: ["delivered", "returned"] },
      },
      {
        $set: {
          deliveryStatus: "dispatched",
        },
      },
    );

    ordersUpdatedCount =
      typeof updateRes?.modifiedCount === "number"
        ? updateRes.modifiedCount
        : typeof updateRes?.nModified === "number"
          ? updateRes.nModified
          : 0;
  }

  const routeIds = (Array.isArray(batch.routes) ? batch.routes : [])
    .map((id) => String(id))
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const etaByOrderId = new Map();

  if (routeIds.length > 0) {
    const stops = await Stop.find({ route: { $in: routeIds } })
      .select("order estimatedArrival")
      .lean();

    for (const stop of stops) {
      const oid = String(stop?.order || "");
      if (!oid) continue;

      const eta = stop?.estimatedArrival
        ? new Date(stop.estimatedArrival)
        : null;

      if (!(eta instanceof Date) || !Number.isFinite(eta.getTime())) continue;

      if (!etaByOrderId.has(oid)) {
        etaByOrderId.set(oid, eta);
      }
    }
  }

  let emailsSent = 0;
  let emailsSkipped = 0;
  let emailsFailed = 0;
  let emailsAttempted = 0;

  const sentDetails = [];
  const skippedDetails = [];
  const failedDetails = [];

  if (orderIds.length > 0) {
    const orders = await Order.find({ _id: { $in: orderIds } })
      .select("_id orderId customer metadata deliveryDate deliveryStatus")
      .populate("customer", "firstName email")
      .lean();

    const claimedIds = await claimOrdersForDispatchEmail(
      orders.map((o) => o._id),
    );

    const jobs = [];

    for (const order of orders) {
      try {
        if (["delivered", "returned"].includes(String(order?.deliveryStatus))) {
          emailsSkipped += 1;
          skippedDetails.push({
            orderId: order.orderId,
            orderDbId: String(order._id),
            reason: "already_delivered_or_returned",
          });
          continue;
        }

        if (order?.metadata?.dispatchedEmailSentAt) {
          emailsSkipped += 1;
          skippedDetails.push({
            orderId: order.orderId,
            orderDbId: String(order._id),
            reason: "already_sent",
          });
          continue;
        }

        if (!claimedIds.has(String(order._id))) {
          emailsSkipped += 1;
          skippedDetails.push({
            orderId: order.orderId,
            orderDbId: String(order._id),
            reason: "already_claimed_or_sent",
          });
          continue;
        }

        const built = buildDispatchEmailJob({
          order,
          batch,
          eta: etaByOrderId.get(String(order._id)),
        });

        if (!built.ok) {
          emailsSkipped += 1;

          await Order.updateOne(
            { _id: order._id },
            {
              $unset: {
                "metadata.dispatchEmailClaimedAt": "",
              },
            },
          );

          skippedDetails.push({
            orderId: order.orderId,
            orderDbId: String(order._id),
            reason: built.reason || "not_eligible",
          });
          continue;
        }

        jobs.push(built.job);
      } catch (err) {
        emailsFailed += 1;

        await Order.updateOne(
          { _id: order._id },
          {
            $set: {
              "metadata.dispatchedEmailLastError": {
                at: new Date(),
                status: null,
                message: "Failed to prepare dispatch email",
              },
            },
            $unset: {
              "metadata.dispatchEmailClaimedAt": "",
            },
          },
        );

        failedDetails.push({
          orderId: order.orderId,
          orderDbId: String(order._id),
          to: String(order?.customer?.email || ""),
          status: null,
          message: "Failed to prepare dispatch email",
        });
      }
    }

    emailsAttempted = jobs.length;

    if (jobs.length > 0) {
      const batchRes = await sendBatchEmails(jobs, {
        chunkSize: 100,
        maxAttempts: 3,
        baseDelayMs: 750,
      });

      const results = Array.isArray(batchRes?.results) ? batchRes.results : [];

      const persisted = await persistDispatchEmailResults(results);

      emailsSent += persisted.sent;
      emailsFailed += persisted.failed;

      for (const result of results) {
        if (result.success) {
          sentDetails.push({
            orderId: result.orderId,
            orderDbId: result.orderDbId,
            to: result.to,
            providerId: result.providerId || null,
          });
        } else {
          failedDetails.push({
            orderId: result.orderId,
            orderDbId: result.orderDbId,
            to: result.to,
            status: result?.error?.status ?? null,
            message: result?.error?.message || "Email send failed",
          });
        }
      }
    }
  }

  return {
    success: true,
    data: {
      batchId: batch._id,
      status: batch.status,
      ordersUpdatedCount,
      emails: {
        sent: emailsSent,
        skipped: emailsSkipped,
        failed: emailsFailed,
        attempted: emailsAttempted,
        details: {
          sent: sentDetails.slice(0, 50),
          skipped: skippedDetails.slice(0, 50),
          failed: failedDetails.slice(0, 50),
        },
      },
    },
  };
}

async function generateRoutes({
  batchId,
  driverIds,
  driverConfigs,
  manualAssignments,
  startTime,
  endTime,
} = {}) {
  try {
    const result = await generateRoutesForBatch({
      batchId,
      driverIds,
      driverConfigs,
      manualAssignments,
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

async function resequenceRouteStops(routeId, session) {
  const stops = await Stop.find({ route: routeId })
    .sort({ sequence: 1, createdAt: 1, _id: 1 })
    .select("_id sequence")
    .session(session);

  if (!stops.length) return 0;

  const ops = [];
  for (let index = 0; index < stops.length; index += 1) {
    const nextSequence = index + 1;
    if (Number(stops[index].sequence) === nextSequence) continue;

    ops.push({
      updateOne: {
        filter: { _id: stops[index]._id },
        update: { $set: { sequence: nextSequence } },
      },
    });
  }

  if (ops.length) {
    await Stop.bulkWrite(ops, { session });
  }

  return stops.length;
}

async function reassignStopDriver({ stopId, driverId } = {}) {
  const normalizedStopId = String(stopId || "").trim();
  const normalizedDriverId = String(driverId || "").trim();

  if (!normalizedStopId) {
    return {
      success: false,
      statusCode: 400,
      message: "stopId is required",
    };
  }

  if (!normalizedDriverId) {
    return {
      success: false,
      statusCode: 400,
      message: "driverId is required",
    };
  }

  if (!mongoose.Types.ObjectId.isValid(normalizedStopId)) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid stopId",
    };
  }

  if (!mongoose.Types.ObjectId.isValid(normalizedDriverId)) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid driverId",
    };
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const stop = await Stop.findById(normalizedStopId)
      .select("_id route order sequence")
      .session(session);

    if (!stop) {
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        statusCode: 404,
        message: "Stop not found",
      };
    }

    const sourceRoute = await Route.findById(stop.route)
      .select("_id batch driver totalStops")
      .session(session);

    if (!sourceRoute) {
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        statusCode: 404,
        message: "Source route not found",
      };
    }

    const driverRole = await Role.findOne({ name: "driver" })
      .select("_id")
      .session(session);

    const targetDriver = await User.findById(normalizedDriverId)
      .select("_id name email status role")
      .session(session);

    if (!targetDriver || String(targetDriver.status) !== "active") {
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        statusCode: 404,
        message: "Driver not found",
      };
    }

    if (
      !driverRole ||
      String(targetDriver.role || "") !== String(driverRole._id || "")
    ) {
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        statusCode: 400,
        message: "Selected user is not a driver",
      };
    }

    const sourceDriverId = String(sourceRoute.driver || "");
    if (sourceDriverId && sourceDriverId === normalizedDriverId) {
      await session.abortTransaction();
      session.endSession();
      return {
        success: true,
        data: {
          stopId: String(stop._id),
          routeId: String(sourceRoute._id),
          driverId: normalizedDriverId,
          createdRoute: false,
          removedEmptyRoute: false,
        },
      };
    }

    const batch = await DeliveryBatch.findById(sourceRoute.batch)
      .select("_id routes")
      .session(session);

    if (!batch) {
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        statusCode: 404,
        message: "Batch not found",
      };
    }

    let targetRoute = await Route.findOne({
      batch: batch._id,
      driver: targetDriver._id,
    })
      .select("_id batch driver totalStops")
      .session(session);

    let createdRoute = false;
    if (!targetRoute) {
      [targetRoute] = await Route.create(
        [
          {
            batch: batch._id,
            driver: targetDriver._id,
            totalStops: 0,
            totalDistanceMeters: 0,
            totalDurationSeconds: 0,
            polyline: "",
            status: "planned",
          },
        ],
        { session },
      );

      createdRoute = true;

      await DeliveryBatch.updateOne(
        { _id: batch._id },
        { $addToSet: { routes: targetRoute._id } },
        { session },
      );
    }

    const targetStopCount = await Stop.countDocuments({
      route: targetRoute._id,
    }).session(session);

    stop.route = targetRoute._id;
    stop.sequence = targetStopCount + 1;
    await stop.save({ session });

    const sourceCount = await resequenceRouteStops(sourceRoute._id, session);
    const targetCount = await resequenceRouteStops(targetRoute._id, session);

    let removedEmptyRoute = false;

    if (sourceCount === 0) {
      await Route.deleteOne({ _id: sourceRoute._id }).session(session);
      await DeliveryBatch.updateOne(
        { _id: batch._id },
        { $pull: { routes: sourceRoute._id } },
        { session },
      );
      removedEmptyRoute = true;
    } else {
      await Route.updateOne(
        { _id: sourceRoute._id },
        { $set: { totalStops: sourceCount } },
        { session },
      );
    }

    await Route.updateOne(
      { _id: targetRoute._id },
      { $set: { totalStops: targetCount } },
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    return {
      success: true,
      data: {
        stopId: String(stop._id),
        routeId: String(targetRoute._id),
        driverId: String(targetDriver._id),
        createdRoute,
        removedEmptyRoute,
      },
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Reassign stop driver error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to reassign stop driver",
    };
  }
}

async function getBatch({ batchId, user } = {}) {
  try {
    if (!batchId) {
      return {
        success: false,
        statusCode: 400,
        message: "batchId is required",
      };
    }

    const userId = getUserId(user);
    const driverScoped = isDriverUser(user) && Boolean(userId);

    if (!driverScoped) {
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
    }

    const batch = await DeliveryBatch.findById(batchId)
      .populate({
        path: "routes",
        populate: {
          path: "driver",
          select: "name email",
        },
      })
      .lean();

    if (!batch) {
      return { success: false, statusCode: 404, message: "Batch not found" };
    }

    const allRoutes = Array.isArray(batch.routes) ? batch.routes : [];
    const routes = allRoutes.filter((r) => {
      const driver = r?.driver;
      const driverId = driver
        ? String(
            typeof driver === "string" ? driver : driver._id || driver.id || "",
          )
        : "";
      return driverId && driverId === userId;
    });

    if (!routes.length) {
      return { success: false, statusCode: 404, message: "Batch not found" };
    }

    const routeIds = routes.map((r) => r._id).filter(Boolean);
    const orderIds = await Stop.distinct("order", { route: { $in: routeIds } });

    const orders = await Order.find({ _id: { $in: orderIds } })
      .populate("customer", "firstName lastName phone")
      .lean();

    return {
      success: true,
      data: {
        ...batch,
        routes,
        orders,
      },
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

async function getRoute({ routeId, user } = {}) {
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

    const userId = getUserId(user);
    const driverScoped = isDriverUser(user) && Boolean(userId);
    if (driverScoped) {
      const routeDriver = route?.driver;
      const routeDriverId = routeDriver
        ? String(
            typeof routeDriver === "string"
              ? routeDriver
              : routeDriver._id || routeDriver.id || "",
          )
        : "";

      if (!routeDriverId || routeDriverId !== userId) {
        return { success: false, statusCode: 404, message: "Route not found" };
      }
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

async function getRouteStock({ routeId, user } = {}) {
  try {
    const userId = getUserId(user);
    const driverScoped = isDriverUser(user) && Boolean(userId);

    if (driverScoped) {
      if (!routeId) {
        return {
          success: false,
          statusCode: 400,
          message: "routeId is required",
        };
      }

      const route = await Route.findById(routeId).select("driver").lean();
      if (!route) {
        return { success: false, statusCode: 404, message: "Route not found" };
      }

      const routeDriverId = route?.driver ? String(route.driver) : "";
      if (!routeDriverId || routeDriverId !== userId) {
        return { success: false, statusCode: 404, message: "Route not found" };
      }
    }

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

async function getOrdersStockRequirements({ orderIds, ordersSheet } = {}) {
  try {
    const ids = Array.isArray(orderIds)
      ? Array.from(new Set(orderIds.map((id) => String(id))))
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map((id) => new mongoose.Types.ObjectId(id))
      : [];

    const sheetRows = Array.isArray(ordersSheet?.rows) ? ordersSheet.rows : [];
    const hasSheet = sheetRows.length > 0;

    if (!ids.length && !hasSheet) {
      return {
        success: false,
        statusCode: 400,
        message: "Provide orderIds or upload an ordersFile (xlsx/csv)",
      };
    }

    const aggregationMap = new Map();

    const upsert = ({
      variantId,
      productId,
      sku,
      name,
      unitPrice,
      quantity,
      orderRef,
    }) => {
      const key = String(variantId || "");
      if (!key) return;

      if (!aggregationMap.has(key)) {
        aggregationMap.set(key, {
          variantId,
          productId,
          sku,
          name,
          unitPrice,
          totalQuantity: 0,
          orders: [],
        });
      }

      const entry = aggregationMap.get(key);
      const qty = Number(quantity);
      if (Number.isFinite(qty) && qty > 0) entry.totalQuantity += qty;
      if (orderRef) {
        entry.orders.push({
          orderId: orderRef.orderId,
          orderDbId: orderRef.orderDbId,
          row: orderRef.row,
          quantity: qty,
        });
      }
    };

    let ordersFound = 0;
    if (ids.length) {
      const orders = await Order.find({ _id: { $in: ids } })
        .select("_id orderId items")
        .lean();

      ordersFound = Array.isArray(orders) ? orders.length : 0;

      for (const order of orders || []) {
        const items = Array.isArray(order?.items) ? order.items : [];
        for (const item of items) {
          upsert({
            variantId: item.variant,
            productId: item.product,
            sku: item.sku,
            name: item.name,
            unitPrice: item.price,
            quantity: item.quantity,
            orderRef: {
              orderId: order.orderId,
              orderDbId: String(order._id),
            },
          });
        }
      }
    }

    let sheetUsableRows = 0;
    let sheetMissingSkus = [];

    if (hasSheet) {
      const manualRows = sheetRows
        .map(buildManualRow)
        .filter((r) => r && (r.orderCell || r.name || r.postcode || r.address));

      const usable = manualRows.filter((r) => r && r.orderCell);
      sheetUsableRows = usable.length;

      if (usable.length) {
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
              {
                $match: { status: "active", lowerSku: { $in: allSkuLower } },
              },
            ])
          : [];

        const variantsByLowerSku = new Map(
          (variantRows || []).map((v) => [String(v.lowerSku), v]),
        );

        sheetMissingSkus = allSkuLower.filter(
          (skuLower) => !variantsByLowerSku.has(String(skuLower)),
        );

        if (sheetMissingSkus.length) {
          return {
            success: false,
            statusCode: 400,
            message: `Some SKUs from the uploaded sheet do not exist or are inactive: ${sheetMissingSkus
              .slice(0, 10)
              .join(", ")}`,
          };
        }

        for (let i = 0; i < usable.length; i++) {
          const row = usable[i];
          const skuQty = parseSkuQtyList(row.orderCell);
          for (const it of skuQty) {
            const v = variantsByLowerSku.get(String(it.sku).toLowerCase());
            if (!v) continue;
            upsert({
              variantId: v._id,
              productId: v.product,
              sku: v.sku,
              name: v.name,
              unitPrice: Number(v.price) || 0,
              quantity: it.qty,
              orderRef: {
                row: i + 2,
                orderId: row.name ? String(row.name) : `row_${i + 2}`,
                orderDbId: null,
              },
            });
          }
        }
      }
    }

    const aggregatedItems = Array.from(aggregationMap.values())
      .filter((x) => Number(x.totalQuantity) > 0)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

    return {
      success: true,
      data: {
        sources: {
          orderIdsProvided: ids.length,
          ordersFound,
          sheet: hasSheet
            ? {
                originalName: ordersSheet?.originalName,
                detectedType: ordersSheet?.detectedType,
                rows: sheetRows.length,
                usableRows: sheetUsableRows,
              }
            : null,
        },
        totalUniqueProducts: aggregatedItems.length,
        items: aggregatedItems,
      },
    };
  } catch (err) {
    console.error("Orders stock requirements error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to calculate stock requirements",
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
  getOrdersStockRequirements,
  deleteBatch,
  reassignStopDriver,
};
