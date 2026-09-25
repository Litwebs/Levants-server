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
} = require("../../utils/deliveryEmail.util");

const DELIVERY_PROOF_CONTENT_ID = "delivery-proof-photo";
const CLOUDINARY_UPLOAD_PATH = "/image/upload/";
const DELIVERY_STATUS_ORDER = [
  "ordered",
  "dispatched",
  "in_transit",
  "delivered",
  "returned",
];

function isBackwardDeliveryStatus(currentStatus, nextStatus) {
  const currentIndex = DELIVERY_STATUS_ORDER.indexOf(String(currentStatus));
  const nextIndex = DELIVERY_STATUS_ORDER.indexOf(String(nextStatus));
  return currentIndex !== -1 && nextIndex !== -1 && nextIndex < currentIndex;
}

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

async function sendInTransitNotification({ orderId, trigger }) {
  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      deliveryStatus: "in_transit",
      "metadata.inTransitEmailSentAt": { $exists: false },
      "metadata.inTransitEmailClaimedAt": { $exists: false },
    },
    { $set: { "metadata.inTransitEmailClaimedAt": new Date() } },
    { new: true },
  )
    .select("_id orderId customer")
    .populate("customer", "firstName email");

  if (!order) return false;

  const to = String(order.customer?.email || "").trim();
  if (!to) {
    await Order.updateOne(
      { _id: orderId },
      { $unset: { "metadata.inTransitEmailClaimedAt": "" } },
    );
    return false;
  }

  const subject = `Your order ${order.orderId || ""} is in transit`;
  try {
    const emailRes = await sendEmail(
      to,
      subject,
      "orderInTransit",
      {
        name: order.customer?.firstName || "there",
        orderId: order.orderId,
      },
      { fromName: "Levants" },
    );

    if (emailRes?.success) {
      const sentAt = new Date();
      const providerId =
        emailRes?.response?.data?.id || emailRes?.response?.id || null;
      await Order.updateOne(
        { _id: orderId, "metadata.inTransitEmailSentAt": { $exists: false } },
        {
          $set: {
            "metadata.inTransitEmailSentAt": sentAt,
            "metadata.inTransitEmailProviderId": providerId,
          },
          $push: {
            emailLog: {
              template: "orderInTransit",
              providerId,
              subject,
              to,
              sentAt,
              trigger,
            },
          },
          $unset: {
            "metadata.inTransitEmailClaimedAt": "",
            "metadata.inTransitEmailLastError": "",
          },
        },
      );
      return true;
    }

    await Order.updateOne(
      { _id: orderId },
      {
        $set: {
          "metadata.inTransitEmailLastError": {
            at: new Date(),
            message: String(emailRes?.error?.message || emailRes?.error || "Email send failed"),
          },
        },
        $unset: { "metadata.inTransitEmailClaimedAt": "" },
      },
    );
  } catch (_) {
    await Order.updateOne(
      { _id: orderId },
      { $unset: { "metadata.inTransitEmailClaimedAt": "" } },
    ).catch(() => {});
  }
  return false;
}

async function UpdateOrderStatus({
  orderId,
  deliveryStatus,
  deliveryProofUrl,
  deliveryNote,
  deliveryProofFile,
  actorUserId,
  actorName,
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

  if (isBackwardDeliveryStatus(prevDeliveryStatus, deliveryStatus)) {
    return {
      success: false,
      statusCode: 409,
      message: `Order status cannot move backwards from ${String(prevDeliveryStatus).replace(/_/g, " ")} to ${String(deliveryStatus).replace(/_/g, " ")}`,
    };
  }

  order.deliveryStatus = deliveryStatus;

  const isDeliveredTransition =
    deliveryStatus === "delivered" && prevDeliveryStatus !== "delivered";
  const isDispatchedTransition =
    deliveryStatus === "dispatched" && prevDeliveryStatus !== "dispatched";
  const isInTransitTransition =
    deliveryStatus === "in_transit" && prevDeliveryStatus !== "in_transit";

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

  // Manual single-order dispatches use the same idempotency claim as delivery
  // runs. Once dispatchedEmailSentAt exists, no dispatch path can send again.
  let dispatchedEmailSent = false;
  if (isDispatchedTransition && !order.metadata?.dispatchedEmailSentAt) {
    try {
      const customerId = order.customer;
      const customer = customerId
        ? await Customer.findById(customerId).select("firstName lastName email")
        : null;
      const built = buildDispatchEmailJob({
        order: {
          _id: order._id,
          orderId: order.orderId,
          deliveryDate: order.deliveryDate,
          customer,
        },
      });

      if (built.ok) {
        const claimedIds = await claimOrdersForDispatchEmail([order._id]);
        if (claimedIds.has(String(order._id))) {
          const job = built.job;
          const emailRes = await sendEmail(
            job.to,
            job.subject,
            job.template,
            job.templateParams,
            job.options,
          );

          if (!order.metadata || typeof order.metadata !== "object") {
            order.metadata = {};
          }

          if (emailRes?.success) {
            const sentAt = new Date();
            const providerId =
              emailRes?.response?.data?.id || emailRes?.response?.id || null;
            order.metadata.dispatchedEmailSentAt = sentAt;
            order.metadata.dispatchedEmailProviderId = providerId;
            delete order.metadata.dispatchedEmailLastError;
            order.emailLog.push({
              template: "orderDispatched",
              providerId,
              subject: job.subject,
              to: job.to,
              sentAt,
              trigger: "status_dispatched",
            });
            dispatchedEmailSent = true;
          } else {
            order.metadata.dispatchedEmailLastError = {
              at: new Date(),
              status:
                emailRes?.error?.statusCode ??
                emailRes?.error?.status ??
                emailRes?.statusCode ??
                null,
              message: String(
                emailRes?.error?.message ||
                  emailRes?.error ||
                  "Email send failed",
              ),
            };
          }

          delete order.metadata.dispatchEmailClaimedAt;
          order.markModified("metadata");
          await order.save();
        }
      }
    } catch (_) {
      // Best-effort email: release any claim and do not fail the status update.
      await Order.updateOne(
        { _id: order._id },
        { $unset: { "metadata.dispatchEmailClaimedAt": "" } },
      ).catch(() => {});
    }
  }

  const inTransitEmailSent = isInTransitTransition
    ? await sendInTransitNotification({
        orderId: order._id,
        trigger: "status_in_transit",
      })
    : false;

  // Send delivered email only on a true transition to delivered,
  // and only if we haven't already sent it.
  const alreadySent = Boolean(order.metadata?.deliveredEmailSentAt);

  let deliveredEmailSent = false;
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
        const frontendBaseUrl =
          process.env.FRONTEND_URL_PROD ||
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
          buildDeliveryProofEmailOptions(proofUrl),
        );

        if (emailRes?.success) {
          if (!order.metadata || typeof order.metadata !== "object")
            order.metadata = {};
          order.metadata.deliveredEmailSentAt = new Date();
          const providerId = emailRes?.response?.data?.id || emailRes?.response?.id || null;
          order.metadata.deliveredEmailProviderId = providerId;
          order.emailLog.push({
            template: "deliveryProof",
            providerId,
            subject,
            to,
            sentAt: new Date(),
            trigger: "status_delivered",
          });
          deliveredEmailSent = true;
          order.markModified("metadata");
          await order.save();
        }
      }
    } catch (_) {
      // Best-effort email: do not fail status update
    }
  }

  if (prevDeliveryStatus !== deliveryStatus) {
    const effects = [];
    if (dispatchedEmailSent) effects.push("Sent the dispatch notification email");
    if (inTransitEmailSent) effects.push("Sent the in-transit notification email");
    if (isDeliveredTransition) effects.push("Recorded delivery completion time");
    if (deliveryProofFile || deliveryProofUrl) effects.push("Attached delivery proof");
    if (deliveryNote) effects.push("Saved a customer delivery note");
    if (deliveredEmailSent) effects.push("Sent the delivery confirmation email");
    order.statusAudit.push({
      from: prevDeliveryStatus || null,
      to: deliveryStatus,
      changedAt: new Date(),
      actor: mongoose.Types.ObjectId.isValid(String(actorUserId || ""))
        ? actorUserId
        : null,
      actorName: actorName || "System",
      actorRole: actorRoleName || null,
      source: isDriverActor ? "driver" : "admin",
      effects,
    });
    await order.save();
  }

  return { success: true, data: order };
}

async function BulkUpdateDeliveryStatus({
  orderIds,
  deliveryStatus,
  actorUserId,
  actorName,
  actorRoleName,
}) {
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
  const shouldEmailInTransit = deliveryStatus === "in_transit";

  const auditCandidates = await Order.find({ _id: { $in: ids } })
    .select("_id orderId deliveryStatus")
    .lean();
  const backwardCandidates = auditCandidates.filter((candidate) =>
    isBackwardDeliveryStatus(candidate.deliveryStatus, deliveryStatus),
  );
  if (backwardCandidates.length) {
    return {
      success: false,
      statusCode: 409,
      message: `Cannot move ${backwardCandidates.length} selected order${backwardCandidates.length === 1 ? "" : "s"} backwards to ${String(deliveryStatus).replace(/_/g, " ")}`,
    };
  }

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

  const now = new Date();
  const operations = auditCandidates.map((candidate) => ({
    updateOne: {
      filter: { _id: candidate._id },
      update: {
        $set: { deliveryStatus, updatedAt: now },
        ...(candidate.deliveryStatus !== deliveryStatus
          ? {
              $push: {
                statusAudit: {
                  from: candidate.deliveryStatus || null,
                  to: deliveryStatus,
                  changedAt: now,
                  actor: mongoose.Types.ObjectId.isValid(String(actorUserId || ""))
                    ? actorUserId
                    : null,
                  actorName: actorName || "System",
                  actorRole: actorRoleName || null,
                  source: "admin_bulk",
                  effects:
                    deliveryStatus === "delivered"
                      ? ["Recorded delivery completion time", "Triggered delivery email processing"]
                      : [],
                },
              },
            }
          : {}),
      },
    },
  }));
  const result = operations.length
    ? await Order.bulkWrite(operations)
    : { matchedCount: 0, modifiedCount: 0 };

  if (shouldEmailInTransit) {
    for (const candidate of auditCandidates) {
      if (candidate.deliveryStatus === deliveryStatus) continue;
      await sendInTransitNotification({
        orderId: candidate._id,
        trigger: "bulk_status_in_transit",
      });
    }
  }

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
        const frontendBaseUrl =
          process.env.FRONTEND_URL_PROD ||
          process.env.FRONTEND_URL_DEV ||
          "https://levantsdairy.co.uk";
        const reviewsUrl = order.orderId
          ? `${frontendBaseUrl}/reviews?orderId=${encodeURIComponent(order.orderId)}`
          : null;

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
          buildDeliveryProofEmailOptions(proofUrl),
        );

        if (emailRes?.success) {
          const providerId =
            emailRes?.response?.data?.id || emailRes?.response?.id || null;
          await Order.updateOne(
            { _id: order._id },
            {
              $set: {
                "metadata.deliveredEmailSentAt": new Date(),
                "metadata.deliveredEmailProviderId": providerId,
              },
              $push: {
                emailLog: {
                  template: "deliveryProof",
                  providerId,
                  subject,
                  to,
                  sentAt: new Date(),
                  trigger: "bulk_status_delivered",
                },
              },
            },
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
