"use strict";

const mongoose = require("mongoose");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const Order = require("../../models/order.model");
const Customer = require("../../models/customer.model");

const sendEmail = require("../../Integration/Email.service");
const { uploadAndCreateFile } = require("../files.service");
const { buildActiveOrderIdQuery } = require("../../utils/ordersAdmin.util");

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
  const order = await Order.findOne(buildActiveOrderIdQuery(orderId));

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

  const shouldEmailDelivered = deliveryStatus === "delivered";

  const candidates = shouldEmailDelivered
    ? await Order.find({
        _id: { $in: ids },
        deliveryStatus: { $ne: "delivered" },
      }).select("_id orderId customer metadata")
    : [];

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

module.exports = {
  UpdateOrderStatus,
  BulkUpdateDeliveryStatus,
  bulkAssignDeliveryDate,
};
