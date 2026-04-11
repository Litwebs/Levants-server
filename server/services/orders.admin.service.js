const Order = require("../models/order.model");
const Customer = require("../models/customer.model");
const ProductVariant = require("../models/variant.model");
const DeliveryBatch = require("../models/deliveryBatch.model");
const Stop = require("../models/stop.model");
const Route = require("../models/route.model");
const DiscountRedemption = require("../models/discountRedemption.model");
const mongoose = require("mongoose");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const { uploadAndCreateFile } = require("./files.service");

const sendEmail = require("../Integration/Email.service");

async function ListOrders({
  filters = {},
  page = 1,
  pageSize = 20,
  sortBy = "createdAt",
  sortOrder = "desc",
}) {
  const query = {};
  const search =
    typeof filters.search === "string" ? filters.search.trim() : "";

  // 🔒 Payment status is restricted (always)
  const ALLOWED_PAYMENT = new Set([
    "pending",
    "unpaid",
    "paid",
    "refund_pending",
    "partially_refunded",
    "refunded",
  ]);
  const DEFAULT_PAYMENT = [
    "pending",
    "unpaid",
    "paid",
    "refund_pending",
    "partially_refunded",
    "refunded",
  ];

  // ✅ Delivery status is filterable
  const ALLOWED_DELIVERY = new Set([
    "ordered",
    "dispatched",
    "in_transit",
    "delivered",
    "returned",
  ]);

  const normalizedOrderSource =
    typeof filters.orderSource === "string"
      ? filters.orderSource.trim().toLowerCase()
      : "";
  const incomingPaymentStatuses = Array.isArray(filters.paymentStatus)
    ? filters.paymentStatus
    : filters.paymentStatus
      ? [filters.paymentStatus]
      : [];

  /* ==============================
     PAYMENT STATUS (LOCKED)
     Always constrain results to pending/paid/refunded/refund_pending
     Ignore whatever the client sends in filters.status
  ============================== */
  const cleanedPaymentStatuses = incomingPaymentStatuses
    .map((status) => String(status).trim().toLowerCase())
    .filter((status) => ALLOWED_PAYMENT.has(status));

  query.status = {
    $in: cleanedPaymentStatuses.length
      ? cleanedPaymentStatuses
      : DEFAULT_PAYMENT,
  };

  /* ==============================
     DELIVERY STATUS (FILTERABLE)
  ============================== */
  if (filters.deliveryStatus) {
    const incoming = Array.isArray(filters.deliveryStatus)
      ? filters.deliveryStatus
      : [filters.deliveryStatus];

    const cleaned = incoming
      .map((s) => String(s).trim().toLowerCase())
      .filter((s) => ALLOWED_DELIVERY.has(s));

    if (cleaned.length) {
      query.deliveryStatus = { $in: cleaned };
    }
    // If cleaned is empty, we simply do NOT apply a deliveryStatus filter.
  }

  if (normalizedOrderSource === "imported") {
    query["metadata.manualImport"] = true;
  } else if (normalizedOrderSource === "website") {
    query["metadata.manualImport"] = { $ne: true };
  }

  /* ==============================
     OTHER FILTERS
  ============================== */

  if (filters.customer) {
    if (mongoose.Types.ObjectId.isValid(filters.customer)) {
      query.customer = filters.customer;
    }
  }

  if (filters.currency) {
    query.currency = filters.currency;
  }

  if (filters.orderId) {
    query.orderId = { $regex: filters.orderId, $options: "i" };
  }

  if (filters.stripeCheckoutSessionId) {
    query.stripeCheckoutSessionId = filters.stripeCheckoutSessionId;
  }

  if (filters.stripePaymentIntentId) {
    query.stripePaymentIntentId = filters.stripePaymentIntentId;
  }

  if (filters.minTotal || filters.maxTotal) {
    query.total = {};
    if (filters.minTotal) query.total.$gte = Number(filters.minTotal);
    if (filters.maxTotal) query.total.$lte = Number(filters.maxTotal);
  }

  if (filters.dateFrom || filters.dateTo) {
    query.createdAt = {};
    if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) query.createdAt.$lte = new Date(filters.dateTo);
  }

  if (filters.paidFrom || filters.paidTo) {
    query.paidAt = {};
    if (filters.paidFrom) query.paidAt.$gte = new Date(filters.paidFrom);
    if (filters.paidTo) query.paidAt.$lte = new Date(filters.paidTo);
  }

  if (filters.refundedOnly) {
    query.$and = Array.isArray(query.$and) ? query.$and : [];
    query.$and.push({
      $or: [
        { "refund.refundedAt": { $ne: null } },
        { "refunds.status": "succeeded" },
        { status: "partially_refunded" },
        { status: "refunded" },
      ],
    });
    // Optional: enforce status = refunded when refundedOnly is true:
    // query.status = "refunded";
  }

  if (filters.restock !== undefined) {
    const want = filters.restock === true;
    query.$and = Array.isArray(query.$and) ? query.$and : [];
    query.$and.push({
      $or: [{ "refund.restock": want }, { "refunds.restock": want }],
    });
  }

  if (filters.expiredOnly) {
    query.expiresAt = { $ne: null };
  }

  /* ==============================
     SORTING
  ============================== */
  const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

  /* ==============================
     EXECUTION
  ============================== */

  if (search) {
    const sortStage = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
    const lower = search.toLowerCase();

    // Only allow status-search matches for allowed payment statuses
    const paymentMatch = ALLOWED_PAYMENT.has(lower) ? [{ status: lower }] : [];

    // Allow delivery status matches too (if user types "delivered" etc.)
    const deliveryMatch = ALLOWED_DELIVERY.has(lower)
      ? [{ deliveryStatus: lower }]
      : [];

    const or = [
      { orderId: { $regex: search, $options: "i" } },
      { stripePaymentIntentId: { $regex: search, $options: "i" } },
      { stripeCheckoutSessionId: { $regex: search, $options: "i" } },

      ...paymentMatch,
      ...deliveryMatch,

      { "customer.firstName": { $regex: search, $options: "i" } },
      { "customer.lastName": { $regex: search, $options: "i" } },
      { "customer.email": { $regex: search, $options: "i" } },
      { "customer.phone": { $regex: search, $options: "i" } },
    ];

    if (mongoose.Types.ObjectId.isValid(search)) {
      const objId = new mongoose.Types.ObjectId(search);
      or.push({ _id: objId });
      or.push({ customerId: objId });
    }

    const pipeline = [
      { $match: query },
      { $addFields: { customerId: "$customer" } },
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
      { $match: { $or: or } },
      { $sort: sortStage },
      {
        $facet: {
          data: [
            { $skip: (Number(page) - 1) * Number(pageSize) },
            { $limit: Number(pageSize) },
          ],
          meta: [{ $count: "total" }],
        },
      },
    ];

    const result = await Order.aggregate(pipeline);
    const orders = result[0]?.data || [];
    const total = result[0]?.meta[0]?.total || 0;

    return {
      success: true,
      data: {
        orders,
        meta: {
          page: Number(page),
          pageSize: Number(pageSize),
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    };
  }

  const total = await Order.countDocuments(query);

  const orders = await Order.find(query)
    .populate({
      path: "customer",
      select: "firstName lastName email phone",
    })
    .sort(sort)
    .skip((page - 1) * pageSize)
    .limit(Number(pageSize));

  return {
    success: true,
    data: {
      orders,
      meta: {
        page: Number(page),
        pageSize: Number(pageSize),
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    },
  };
}

async function UpdateOrderPaymentStatus({ orderId, paid, actorUserId } = {}) {
  if (!orderId) {
    return { success: false, statusCode: 400, message: "orderId is required" };
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return { success: false, statusCode: 404, message: "Order not found" };
  }

  const isStripeBacked = Boolean(
    String(order.stripeCheckoutSessionId || "").trim() ||
    String(order.stripePaymentIntentId || "").trim(),
  );

  // Only allow toggling payment for non-Stripe / file-imported orders.
  const isManualImport = Boolean(order?.metadata?.manualImport);
  if (isStripeBacked || !isManualImport) {
    return {
      success: false,
      statusCode: 400,
      message: "Payment status can only be edited for file-imported orders",
    };
  }

  const normalizedPaid = Boolean(paid);

  // Do not allow toggling for refunded states.
  const lockedStatuses = new Set([
    "refund_pending",
    "partially_refunded",
    "refunded",
  ]);
  if (lockedStatuses.has(String(order.status))) {
    return {
      success: false,
      statusCode: 400,
      message: "Payment status cannot be changed for refunded orders",
    };
  }

  const now = new Date();

  if (normalizedPaid) {
    order.status = "paid";
    order.paidAt = order.paidAt || now;
  } else {
    order.status = "unpaid";
    order.paidAt = undefined;
  }

  if (!order.metadata || typeof order.metadata !== "object")
    order.metadata = {};
  order.metadata.paymentStatusUpdatedAt = now;
  if (actorUserId) order.metadata.paymentStatusUpdatedBy = String(actorUserId);
  order.markModified("metadata");

  await order.save();

  return { success: true, data: order };
}

async function GetOrderById({ orderId }) {
  const order = await Order.findById(orderId).populate("customer");

  if (!order) {
    return { success: false, message: "Order not found" };
  }

  return { success: true, data: order };
}

async function UpdateOrderStatus({
  orderId,
  deliveryStatus,
  deliveryProofUrl,
  deliveryNote,
  deliveryProofFile,
  actorUserId,
  actorRoleName,
  actorPermissions,
}) {
  const order = await Order.findById(orderId);

  if (!order) {
    return { success: false, statusCode: 404, message: "Order not found" };
  }

  const prevDeliveryStatus = order.deliveryStatus;

  const permissionAllows = (permissions, requiredPermission) => {
    if (!Array.isArray(permissions)) return false;

    if (permissions.includes("*")) return true;
    if (permissions.includes(requiredPermission)) return true;

    for (const perm of permissions) {
      if (typeof perm !== "string") continue;
      if (!perm.endsWith(".*")) continue;
      const prefix = perm.slice(0, -1); // keep trailing dot
      if (requiredPermission.startsWith(prefix)) return true;
    }

    return false;
  };

  const normalizedRoleName =
    typeof actorRoleName === "string" ? actorRoleName.toLowerCase() : "";
  const isDriverActor =
    normalizedRoleName === "driver" ||
    (permissionAllows(actorPermissions, "delivery.routes.read") &&
      !permissionAllows(actorPermissions, "delivery.routes.update"));

  if (
    isDriverActor &&
    prevDeliveryStatus === "delivered" &&
    deliveryStatus !== "delivered"
  ) {
    return {
      success: false,
      statusCode: 403,
      message: "Delivered orders are locked",
    };
  }

  order.deliveryStatus = deliveryStatus;

  const isDeliveredTransition =
    deliveryStatus === "delivered" && prevDeliveryStatus !== "delivered";

  if (isDeliveredTransition) {
    if (!order.metadata || typeof order.metadata !== "object")
      order.metadata = {};
    if (!order.metadata.deliveredAt) {
      order.metadata.deliveredAt = new Date();
      order.markModified("metadata");
    }
  }

  if (deliveryProofUrl !== undefined) {
    const cleaned = String(deliveryProofUrl || "").trim();
    if (!order.metadata || typeof order.metadata !== "object")
      order.metadata = {};
    if (cleaned) order.metadata.deliveryProofUrl = cleaned;
    else delete order.metadata.deliveryProofUrl;
    order.markModified("metadata");
  }

  if (deliveryNote !== undefined) {
    const cleaned = String(deliveryNote || "").trim();
    if (!order.metadata || typeof order.metadata !== "object")
      order.metadata = {};
    if (cleaned) order.metadata.deliveryNote = cleaned;
    else delete order.metadata.deliveryNote;
    order.markModified("metadata");
  }

  if (deliveryProofFile) {
    try {
      const uploadedBy = actorUserId;
      if (!uploadedBy) {
        return {
          success: false,
          statusCode: 400,
          message: "actorUserId is required to upload delivery proof",
        };
      }

      const mimeType = String(deliveryProofFile.mimetype || "");
      if (!mimeType.startsWith("image/")) {
        return {
          success: false,
          statusCode: 400,
          message: "deliveryProof must be an image",
        };
      }

      const ext = mimeType.split("/")[1] || "jpg";
      const filename = `${crypto.randomUUID()}.${ext}`;
      const localPath = path.join("/tmp", filename);
      const buffer = deliveryProofFile.buffer;
      await fs.writeFile(localPath, buffer);

      const uploadRes = await uploadAndCreateFile({
        localPath,
        originalName: String(deliveryProofFile.originalname || filename),
        mimeType,
        sizeBytes: Number(deliveryProofFile.size || buffer?.length || 0),
        uploadedBy,
        folder: "levants/delivery-proofs",
      });

      if (!uploadRes?.success || !uploadRes?.data?.url) {
        return {
          success: false,
          statusCode: 500,
          message: uploadRes?.message || "Failed to upload delivery proof",
        };
      }

      if (!order.metadata || typeof order.metadata !== "object")
        order.metadata = {};

      order.metadata.deliveryProofUrl = uploadRes.data.url;
      order.metadata.deliveryProofFileId = uploadRes.data._id;
      order.markModified("metadata");
    } catch (e) {
      return {
        success: false,
        statusCode: 500,
        message: "Failed to upload delivery proof",
      };
    }
  }

  await order.save();

  // Send delivered email only on a true transition to delivered,
  // and only if we haven't already sent it.
  const alreadySent = Boolean(order.metadata?.deliveredEmailSentAt);

  if (isDeliveredTransition && !alreadySent) {
    try {
      const customerId = order.customer;
      const customer = customerId
        ? await Customer.findById(customerId).select("firstName lastName email")
        : null;

      const to = String(customer?.email || "").trim();
      if (to) {
        const proofUrl = String(order.metadata?.deliveryProofUrl || "").trim();
        const note = String(order.metadata?.deliveryNote || "").trim();
        const subject = `Your order ${order.orderId || ""} was delivered`;
        console.log(
          `Sending delivery proof email to ${to} with proof URL: ${proofUrl}`,
        );
        const emailRes = await sendEmail(
          to,
          subject,
          "deliveryProof",
          {
            name: customer?.firstName || "there",
            orderId: order.orderId,
            proofUrl,
            deliveryNote: note,
            deliveredAt: new Date().toLocaleString("en-GB"),
          },
          {
            fromName: "Levants",
          },
        );

        if (emailRes?.success) {
          // Persist marker to prevent duplicates.
          if (!order.metadata || typeof order.metadata !== "object")
            order.metadata = {};
          order.metadata.deliveredEmailSentAt = new Date();
          order.markModified("metadata");
          await order.save();
        }
      }
    } catch (_) {
      // Best-effort email: do not fail status update
    }
  }

  return { success: true, data: order };
}

async function BulkUpdateDeliveryStatus({ orderIds, deliveryStatus }) {
  const ids = orderIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (!ids.length) {
    return {
      success: false,
      statusCode: 400,
      message: "No valid orderIds provided",
    };
  }

  // If we're marking orders as delivered in bulk, also notify customers.
  // This is best-effort and will not fail the bulk update if sending fails.
  const shouldEmailDelivered = deliveryStatus === "delivered";

  // Pre-fetch candidates (before update) so we can detect transitions.
  const candidates = shouldEmailDelivered
    ? await Order.find({
        _id: { $in: ids },
        deliveryStatus: { $ne: "delivered" },
      }).select("_id orderId customer metadata")
    : [];

  // Preserve existing behavior (update all IDs), but additionally stamp a stable
  // deliveredAt timestamp for true transitions to delivered.
  if (deliveryStatus === "delivered") {
    await Order.updateMany(
      { _id: { $in: ids }, deliveryStatus: { $ne: "delivered" } },
      {
        $set: {
          "metadata.deliveredAt": new Date(),
        },
      },
    );
  }

  const result = await Order.updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        deliveryStatus,
        updatedAt: new Date(),
      },
    },
  );

  if (shouldEmailDelivered && Array.isArray(candidates) && candidates.length) {
    try {
      const eligible = candidates.filter(
        (o) => !o?.metadata?.deliveredEmailSentAt,
      );

      const customerIds = Array.from(
        new Set(
          eligible
            .map((o) => String(o.customer || ""))
            .filter((id) => mongoose.Types.ObjectId.isValid(id)),
        ),
      ).map((id) => new mongoose.Types.ObjectId(id));

      const customers = customerIds.length
        ? await Customer.find({ _id: { $in: customerIds } }).select(
            "firstName lastName email",
          )
        : [];

      const customerById = new Map(customers.map((c) => [String(c._id), c]));

      for (const order of eligible) {
        const customer = customerById.get(String(order.customer));
        const to = String(customer?.email || "").trim();
        if (!to) continue;

        const proofUrl = String(order.metadata?.deliveryProofUrl || "").trim();
        const note = String(order.metadata?.deliveryNote || "").trim();
        const subject = `Your order ${order.orderId || ""} was delivered`;

        const emailRes = await sendEmail(
          to,
          subject,
          "deliveryProof",
          {
            name: customer?.firstName || "there",
            orderId: order.orderId,
            proofUrl,
            deliveryNote: note,
            deliveredAt: new Date().toLocaleString("en-GB"),
          },
          { fromName: "Levants" },
        );

        if (emailRes?.success) {
          await Order.updateOne(
            { _id: order._id },
            { $set: { "metadata.deliveredEmailSentAt": new Date() } },
          );
        }
      }
    } catch (_) {
      // Best-effort email sending
    }
  }

  return {
    success: true,
    data: {
      matched: result.matchedCount ?? result.n ?? 0,
      modified: result.modifiedCount ?? result.nModified ?? 0,
    },
  };
}

async function bulkAssignDeliveryDate({ orderIds, deliveryDate }) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return { success: false, statusCode: 400, message: "orderIds required" };
  }

  if (!deliveryDate) {
    return {
      success: false,
      statusCode: 400,
      message: "deliveryDate required",
    };
  }

  const ids = orderIds
    .map((id) => String(id))
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (!ids.length) {
    return {
      success: false,
      statusCode: 400,
      message: "No valid orderIds provided",
    };
  }

  const date = new Date(deliveryDate);
  if (Number.isNaN(date.getTime())) {
    return { success: false, statusCode: 400, message: "Invalid deliveryDate" };
  }

  // Normalize to midnight UTC
  date.setUTCHours(0, 0, 0, 0);

  const result = await Order.updateMany(
    {
      _id: { $in: ids },
      status: "paid",
    },
    {
      $set: { deliveryDate: date, updatedAt: new Date() },
    },
  );

  return {
    success: true,
    data: {
      matched: result.matchedCount ?? result.n ?? 0,
      modified: result.modifiedCount ?? result.nModified ?? 0,
      deliveryDate: date,
    },
  };
}

async function UpdateOrderItems({ orderId, items, actorUserId } = {}) {
  if (!orderId) {
    return { success: false, statusCode: 400, message: "orderId is required" };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, statusCode: 400, message: "items is required" };
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return { success: false, statusCode: 404, message: "Order not found" };
  }

  const resolvedItems = [];
  let subtotal = 0;

  for (const item of items) {
    const quantity = Number(item?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { success: false, statusCode: 400, message: "Invalid quantity" };
    }

    const variantId = String(item?.variantId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(variantId)) {
      return {
        success: false,
        statusCode: 400,
        message: "Invalid variantId",
      };
    }

    const variant = await ProductVariant.findOne({
      _id: variantId,
      status: "active",
    }).select("_id product name sku price status");

    if (!variant) {
      return {
        success: false,
        statusCode: 400,
        message: "Variant not found or inactive",
      };
    }

    const price = Number(variant.price) || 0;
    const lineSubtotal = price * quantity;

    resolvedItems.push({
      product: variant.product,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price,
      quantity,
      subtotal: lineSubtotal,
    });

    subtotal += lineSubtotal;
  }

  if (!resolvedItems.length) {
    return {
      success: false,
      statusCode: 400,
      message: "Order must contain at least one item",
    };
  }

  const deliveryFee = Number(order.deliveryFee || 0);
  const discountAmount = Math.max(0, Number(order.discountAmount || 0));
  const totalBeforeDiscount = Math.max(0, subtotal + deliveryFee);
  const total = Math.max(0, totalBeforeDiscount - discountAmount);

  order.items = resolvedItems;
  order.subtotal = subtotal;
  order.totalBeforeDiscount = totalBeforeDiscount;
  order.total = total;
  order.isDiscounted = discountAmount > 0;

  const now = new Date();
  if (!order.metadata || typeof order.metadata !== "object")
    order.metadata = {};
  order.metadata.itemsUpdatedAt = now;
  if (actorUserId) order.metadata.itemsUpdatedBy = String(actorUserId);
  order.markModified("metadata");

  await order.save();

  return { success: true, data: order };
}

async function deleteOrderDocument(order) {
  const stops = await Stop.find({ order: order._id }).select("route").lean();
  const routeIds = Array.from(
    new Set(
      stops
        .map((stop) => String(stop.route || ""))
        .filter((id) => mongoose.Types.ObjectId.isValid(id)),
    ),
  ).map((id) => new mongoose.Types.ObjectId(id));

  await Promise.all([
    DeliveryBatch.updateMany(
      { orders: order._id },
      { $pull: { orders: order._id } },
    ),
    Stop.deleteMany({ order: order._id }),
    DiscountRedemption.deleteMany({ order: order._id }),
    Order.deleteOne({ _id: order._id }),
  ]);

  if (routeIds.length > 0) {
    await Promise.all(
      routeIds.map(async (routeId) => {
        const totalStops = await Stop.countDocuments({ route: routeId });
        await Route.updateOne({ _id: routeId }, { $set: { totalStops } });
      }),
    );
  }
}

async function DeleteOrder({ orderId } = {}) {
  if (!orderId) {
    return { success: false, statusCode: 400, message: "orderId is required" };
  }

  const order = await Order.findById(orderId).select("_id");
  if (!order) {
    return { success: false, statusCode: 404, message: "Order not found" };
  }

  await deleteOrderDocument(order);

  return {
    success: true,
    data: {
      deleted: true,
      orderId: String(order._id),
    },
  };
}

async function BulkDeleteOrders({ orderIds } = {}) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return { success: false, statusCode: 400, message: "orderIds required" };
  }

  const ids = orderIds
    .map((id) => String(id))
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (!ids.length) {
    return {
      success: false,
      statusCode: 400,
      message: "No valid orderIds provided",
    };
  }

  const orders = await Order.find({ _id: { $in: ids } }).select("_id");

  for (const order of orders) {
    await deleteOrderDocument(order);
  }

  return {
    success: true,
    data: {
      matched: ids.length,
      deleted: orders.length,
    },
  };
}

module.exports = {
  ListOrders,
  GetOrderById,
  UpdateOrderStatus,
  UpdateOrderPaymentStatus,
  UpdateOrderItems,
  DeleteOrder,
  BulkDeleteOrders,
  BulkUpdateDeliveryStatus,
  bulkAssignDeliveryDate,
};
