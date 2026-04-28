"use strict";

const mongoose = require("mongoose");
const DeliveryBatch = require("../../models/deliveryBatch.model");
const Order = require("../../models/order.model");
const Stop = require("../../models/stop.model");
const { sendBatchEmails } = require("../../Integration/Email.service");
const {
  buildDispatchEmailJob,
  claimOrdersForDispatchEmail,
  persistDispatchEmailResults,
} = require("../../utils/deliveryEmail.util");

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

module.exports = { dispatchBatch };
