"use strict";

const Order = require("../models/order.model");
const sendEmail = require("../Integration/Email.service");
const {
  roundToNearestMinutes,
  formatUkTime,
  formatUkDate,
} = require("./deliveryTime.util");

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

module.exports = {
  buildDispatchEmailSubject,
  buildDispatchEmailJob,
  claimOrdersForDispatchEmail,
  persistDispatchEmailResults,
  sleep,
  getEmailErrorStatus,
  getEmailErrorMessage,
  shouldRetryEmail,
  sendEmailWithRetry,
};
