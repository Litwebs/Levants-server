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
const {
  buildDispatchEmailJob,
  claimOrdersForDispatchEmail,
  persistDispatchEmailResults,
  sendEmailWithRetry,
} = require("../../utils/deliveryEmail.util");

const DELIVERY_PROOF_CONTENT_ID = "delivery-proof-photo";
const CLOUDINARY_UPLOAD_PATH = "/image/upload/";

function getEmailCompatibleProofUrl(proofUrl) {
  try {
    const url = new URL(proofUrl);
    const uploadIndex = url.pathname.indexOf(CLOUDINARY_UPLOAD_PATH);

    if (url.hostname === "res.cloudinary.com" && uploadIndex !== -1) {
      const insertAt = uploadIndex + CLOUDINARY_UPLOAD_PATH.length;
      url.pathname = `${url.pathname.slice(0, insertAt)}f_jpg,q_auto:good,w_1200,c_limit/${url.pathname.slice(insertAt)}`;
      return url.toString();
    }
  } catch (_) {}

  return proofUrl;
}

function getDeliveryProofFilename(proofUrl) {
  try {
    const extension = path.posix
      .extname(new URL(proofUrl).pathname)
      .toLowerCase();

    if (/^\.[a-z0-9]{2,5}$/.test(extension)) {
      return `delivery-proof${extension}`;
    }
  } catch (_) {}

  return "delivery-proof.jpg";
}

function buildDeliveryProofEmailOptions(proofUrl) {
  const options = { fromName: "Levants" };
  if (!proofUrl) return options;

  const attachmentUrl = getEmailCompatibleProofUrl(proofUrl);

  options.attachments = [
    {
      filename:
        attachmentUrl === proofUrl
          ? getDeliveryProofFilename(attachmentUrl)
          : "delivery-proof.jpg",
      path: attachmentUrl,
      contentId: DELIVERY_PROOF_CONTENT_ID,
    },
  ];

  return options;
}

async function UpdateOrderStatus({
  orderId,
  deliveryStatus,
  deliveryProofUrl,
  deliveryNote,
  deliveryProofFile,
  actorUserId,
  actorRoleName,
  actorName,
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

  if (prevDeliveryStatus !== deliveryStatus) {
    order.statusAudit ||= [];
    order.statusAudit.push({
      from: prevDeliveryStatus,
      to: deliveryStatus,
      changedAt: new Date(),
      actorId: actorUserId,
      actorName: actorName || (actorUserId ? "Administrator" : "System"),
      actorRole: actorRoleName,
      source: "admin",
      effects: [],
    });
  }
  await order.save();

  if (deliveryStatus === "dispatched" && !order.metadata?.dispatchedEmailSentAt) {
    const claimed = await claimOrdersForDispatchEmail([order._id]);
    if (claimed.has(String(order._id))) {
      let result;
      try {
        const customer = await Customer.findById(order.customer).select("firstName email").lean();
        const built = buildDispatchEmailJob({ order: { ...order.toObject(), customer } });
        if (!built.ok) throw new Error("Customer email not found");
        const job = built.job;
        const sent = await sendEmailWithRetry({
          to: job.to,
          subject: job.subject,
          template: job.template,
          params: job.templateParams,
          options: { ...job.options, auditOrderId: order._id },
        });
        result = {
          orderDbId: order._id,
          success: !!sent?.success,
          providerId: sent?.response?.data?.id || sent?.response?.id || null,
          error: { message: sent?.error?.message || "Dispatch email failed" },
        };
      } catch (error) {
        result = { orderDbId: order._id, success: false, error: { message: error.message } };
      }
      await persistDispatchEmailResults([result]);
    }
  }

  if (deliveryStatus === "in_transit" && !order.metadata?.inTransitEmailSentAt) {
    const claimToken = crypto.randomUUID();
    const claimed = await Order.findOneAndUpdate({
      _id: order._id,
      deliveryStatus: "in_transit",
      "metadata.inTransitEmailSentAt": { $exists: false },
      $or: [
        { "metadata.inTransitEmailClaimedAt": { $exists: false } },
        { "metadata.inTransitEmailClaimedAt": { $lt: new Date(Date.now() - 5 * 60 * 1000) } },
      ],
    }, { $set: { "metadata.inTransitEmailClaimedAt": new Date(), "metadata.inTransitEmailClaim": claimToken } }, { new: true });
    if (claimed) {
      const fence = { _id: order._id, "metadata.inTransitEmailClaim": claimToken };
      try {
        const customer = await Customer.findById(order.customer).select("firstName email").lean();
        if (!customer?.email) throw new Error("Customer email not found");
        const sent = await sendEmailWithRetry({
          to: customer.email,
          subject: `Your order ${order.orderId || ""} is in transit`,
          template: "orderInTransit",
          params: { name: customer.firstName || "there", orderId: order.orderId },
          options: { fromName: "Levants", auditOrderId: order._id },
        });
        if (!sent?.success) throw new Error(sent?.error?.message || "In-transit email failed");
        await Order.updateOne(fence, {
          $set: {
            "metadata.inTransitEmailSentAt": new Date(),
            "metadata.inTransitEmailProviderId": sent?.response?.data?.id || sent?.response?.id || null,
          },
          $unset: { "metadata.inTransitEmailClaim": "", "metadata.inTransitEmailClaimedAt": "", "metadata.inTransitEmailLastError": "" },
        });
      } catch (error) {
        await Order.updateOne(fence, {
          $set: { "metadata.inTransitEmailLastError": { at: new Date(), message: error.message } },
          $unset: { "metadata.inTransitEmailClaim": "", "metadata.inTransitEmailClaimedAt": "" },
        });
      }
    }
  }

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
        const frontendBaseUrl = process.env.APP_ENV === "uat"
          ? process.env.CUSTOMER_PORTAL_URL_PROD
          : process.env.FRONTEND_URL_PROD ||
            process.env.CLIENT_FRONT_URL_DEV ||
            "https://levantsdairy.co.uk";
        const reviewsUrl = order.orderId
          ? `${frontendBaseUrl}/reviews?orderId=${encodeURIComponent(order.orderId)}`
          : null;
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
            proofSrc: proofUrl ? `cid:${DELIVERY_PROOF_CONTENT_ID}` : "",
            deliveryNote: note,
            deliveredAt: new Date().toLocaleString("en-GB"),
            reviewsUrl,
          },
          { ...buildDeliveryProofEmailOptions(proofUrl), auditOrderId: order._id },
        );

        if (emailRes?.success) {
          if (!order.metadata || typeof order.metadata !== "object")
            order.metadata = {};
          await Order.updateOne({ _id: order._id }, {
            $set: { "metadata.deliveredEmailSentAt": new Date() },
          });
        }
      }
    } catch (_) {
      // Best-effort email: do not fail status update
    }
  }

  return { success: true, data: await Order.findById(order._id) };
}

async function BulkUpdateDeliveryStatus({ orderIds, deliveryStatus, ...actor }) {
  const ids = [...new Set((orderIds || []).map(String))]
    .filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!ids.length) {
    return { success: false, statusCode: 400, message: "No valid orderIds provided" };
  }
  let matched = 0;
  let modified = 0;
  for (const orderId of ids) {
    const existing = await Order.findOne(buildActiveOrderIdQuery(orderId));
    if (!existing) continue;
    const previousStatus = existing.deliveryStatus;
    const result = await UpdateOrderStatus({ orderId, deliveryStatus, ...actor });
    if (!result.success) return result;
    matched++;
    if (previousStatus !== deliveryStatus) modified++;
  }
  return { success: true, data: { matched, modified } };
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
      status: { $in: ["paid", "partially_refunded", "partially_paid"] },
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
