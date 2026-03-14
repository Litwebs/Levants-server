const mongoose = require("mongoose");
const Order = require("../models/order.model");
const ProductVariant = require("../models/variant.model");
const stripe = require("../utils/stripe.util");

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

function toMinorUnits(amountMajor, currency) {
  const cur = String(currency || "").toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(cur)) return Math.round(Number(amountMajor));
  return Math.round(Number(amountMajor) * 100);
}

function toMajorUnits(amountMinor, currency) {
  const cur = String(currency || "").toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(cur)) return Number(amountMinor);
  return Number(amountMinor) / 100;
}

function getOrderTotalMinor(order) {
  return toMinorUnits(order.total || 0, order.currency || "GBP");
}

function sumSucceededRefundedMinor(order) {
  const refunds = Array.isArray(order.refunds) ? order.refunds : [];
  let sum = 0;
  for (const r of refunds) {
    if (!r || r.status !== "succeeded") continue;
    if (typeof r.amountMinor === "number" && Number.isFinite(r.amountMinor)) {
      sum += Math.max(0, Math.round(r.amountMinor));
      continue;
    }
    if (typeof r.amount === "number" && Number.isFinite(r.amount)) {
      sum += Math.max(0, toMinorUnits(r.amount, r.currency || order.currency));
    }
  }

  // Back-compat for legacy single-refund representation.
  if (sum === 0 && order.status === "refunded" && order.refund?.refundedAt) {
    return getOrderTotalMinor(order);
  }

  return sum;
}

function hasPendingRefund(order) {
  const refunds = Array.isArray(order.refunds) ? order.refunds : [];
  return refunds.some((r) => r?.status === "pending");
}

function computeRefundDerivedOrderStatus(order) {
  const totalMinor = getOrderTotalMinor(order);
  const refundedMinor = sumSucceededRefundedMinor(order);
  const pending = hasPendingRefund(order);

  if (totalMinor > 0 && refundedMinor >= totalMinor) return "refunded";
  if (pending) return "refund_pending";
  if (refundedMinor > 0) return "partially_refunded";
  return "paid";
}

async function RefundOrder({
  orderId,
  adminUserId,
  amount,
  reason,
  restock,
} = {}) {
  try {
    const order = await Order.findById(orderId);

    if (!order) {
      return { success: false, statusCode: 404, message: "Order not found" };
    }

    if (order.status === "refunded") {
      return {
        success: false,
        statusCode: 409,
        message: "Order is already fully refunded",
      };
    }

    if (order.status === "refund_pending") {
      return {
        success: false,
        statusCode: 409,
        message: "Refund already initiated",
      };
    }

    if (order.status !== "paid" && order.status !== "partially_refunded") {
      return {
        success: false,
        statusCode: 400,
        message: "Only paid orders can be refunded",
      };
    }

    if (hasPendingRefund(order)) {
      return {
        success: false,
        statusCode: 409,
        message: "A refund is already pending for this order",
      };
    }

    let paymentIntentId = order.stripePaymentIntentId;

    if (!paymentIntentId && order.stripeCheckoutSessionId) {
      const session = await stripe.checkout.sessions.retrieve(
        order.stripeCheckoutSessionId,
        {
          expand: ["payment_intent"],
        },
      );

      const maybePaymentIntent = session?.payment_intent;
      paymentIntentId =
        typeof maybePaymentIntent === "string"
          ? maybePaymentIntent
          : maybePaymentIntent?.id;

      if (paymentIntentId) {
        order.stripePaymentIntentId = paymentIntentId;
      }
    }

    if (!paymentIntentId) {
      return {
        success: false,
        statusCode: 400,
        message: "Missing Stripe payment reference",
      };
    }

    const currency = order.currency || "GBP";
    const totalMinor = getOrderTotalMinor(order);
    const alreadyRefundedMinor = sumSucceededRefundedMinor(order);
    const remainingMinor = Math.max(0, totalMinor - alreadyRefundedMinor);

    if (remainingMinor <= 0) {
      return {
        success: false,
        statusCode: 409,
        message: "Order is already fully refunded",
      };
    }

    const requestedMinor =
      typeof amount === "number" && Number.isFinite(amount)
        ? toMinorUnits(amount, currency)
        : remainingMinor;

    if (!Number.isFinite(requestedMinor) || requestedMinor <= 0) {
      return {
        success: false,
        statusCode: 400,
        message: "Invalid refund amount",
      };
    }

    if (requestedMinor > remainingMinor) {
      return {
        success: false,
        statusCode: 400,
        message: `Refund amount exceeds remaining refundable amount (${toMajorUnits(
          remainingMinor,
          currency,
        ).toFixed(2)} ${currency})`,
      };
    }

    const isFullRemainingRefund = requestedMinor === remainingMinor;
    if (Boolean(restock) === true && !isFullRemainingRefund) {
      return {
        success: false,
        statusCode: 400,
        message:
          "Restock can only be used when refunding the full remaining order amount",
      };
    }

    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: requestedMinor,
        metadata: {
          orderId: order._id.toString(),
          initiatedBy: adminUserId ? String(adminUserId) : "",
        },
      },
      {
        idempotencyKey: `admin_refund_${order._id}_${paymentIntentId}_${requestedMinor}_${alreadyRefundedMinor}`,
      },
    );

    const stripeStatus = String(refund.status || "").toLowerCase();
    const mappedStatus =
      stripeStatus === "succeeded"
        ? "succeeded"
        : stripeStatus === "failed"
          ? "failed"
          : "pending";

    const refundRecord = {
      stripeRefundId: refund.id,
      paymentIntentId,
      currency,
      amount: toMajorUnits(requestedMinor, currency),
      amountMinor: requestedMinor,
      status: mappedStatus,
      refundedAt: mappedStatus === "succeeded" ? new Date() : undefined,
      failedAt: mappedStatus === "failed" ? new Date() : undefined,
      refundedBy: adminUserId,
      reason: reason || null,
      restock: Boolean(restock),
      createdAt: new Date(),
    };

    order.refunds = Array.isArray(order.refunds) ? order.refunds : [];
    order.refunds.push(refundRecord);

    // Keep legacy field populated for older clients/filters.
    order.refund = {
      ...(order.refund || {}),
      refundedBy: adminUserId,
      reason: reason || null,
      restock: Boolean(restock),
      stripeRefundId: refund.id,
      refundedAt:
        mappedStatus === "succeeded" ? new Date() : order.refund?.refundedAt,
    };

    // If Stripe returned succeeded immediately, compute derived status now.
    // Otherwise keep it pending until webhook updates it.
    order.status =
      mappedStatus === "pending"
        ? "refund_pending"
        : computeRefundDerivedOrderStatus(order);

    // Restock only when we are now fully refunded.
    if (Boolean(restock) === true && order.status === "refunded") {
      for (const item of order.items) {
        await ProductVariant.findByIdAndUpdate(item.variant, {
          $inc: { stockQuantity: item.quantity },
        });
      }
    }

    await order.save();

    return {
      success: true,
      data: {
        refundId: refund.id,
        status: refund.status,
      },
    };
  } catch (err) {
    return {
      success: false,
      statusCode: 500,
      message: "Refund failed",
    };
  }
}

async function finalizeRefundForOrderByPaymentIntent(paymentIntentId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findOne({
      stripePaymentIntentId: paymentIntentId,
      status: "refund_pending",
    }).session(session);

    if (!order) return null;

    // Legacy full-refund path (no multi-refund tracking).
    if (order.refund?.restock === true) {
      for (const item of order.items) {
        await ProductVariant.findByIdAndUpdate(
          item.variant,
          { $inc: { stockQuantity: item.quantity } },
          { session },
        );
      }
    }

    order.status = "refunded";
    order.refund.refundedAt = new Date();
    await order.save({ session });

    const refundedOrderId = order._id;

    await session.commitTransaction();
    session.endSession();

    return refundedOrderId;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

async function applyStripeRefundSucceeded({
  paymentIntentId,
  stripeRefundId,
  amountMinor,
  currency,
} = {}) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findOne({
      stripePaymentIntentId: paymentIntentId,
      $or: [
        { "refunds.stripeRefundId": stripeRefundId },
        { "refund.stripeRefundId": stripeRefundId },
      ],
    }).session(session);

    if (!order) {
      await session.commitTransaction();
      session.endSession();
      return null;
    }

    order.refunds = Array.isArray(order.refunds) ? order.refunds : [];
    const record = order.refunds.find(
      (r) => r?.stripeRefundId === stripeRefundId,
    );
    if (record) {
      record.status = "succeeded";
      record.refundedAt = record.refundedAt || new Date();
      if (typeof amountMinor === "number" && Number.isFinite(amountMinor)) {
        record.amountMinor = Math.round(amountMinor);
        record.amount = toMajorUnits(
          record.amountMinor,
          record.currency || currency || order.currency,
        );
      }
    } else {
      // If this refund was created outside our app (or older data), store a minimal record.
      const cur = currency || order.currency || "GBP";
      const minor =
        typeof amountMinor === "number" ? Math.round(amountMinor) : undefined;
      order.refunds.push({
        stripeRefundId,
        paymentIntentId,
        currency: cur,
        amountMinor: minor,
        amount:
          typeof minor === "number" ? toMajorUnits(minor, cur) : undefined,
        status: "succeeded",
        refundedAt: new Date(),
        createdAt: new Date(),
        restock: false,
      });
    }

    // Keep legacy field best-effort.
    order.refund = {
      ...(order.refund || {}),
      stripeRefundId,
      refundedAt: order.refund?.refundedAt || new Date(),
    };

    // If restock was requested for the refund that completes the order, do it transactionally.
    const nextStatus = computeRefundDerivedOrderStatus(order);
    if (nextStatus === "refunded") {
      const last = order.refunds.find(
        (r) => r?.stripeRefundId === stripeRefundId,
      );
      if (last?.restock === true) {
        for (const item of order.items) {
          await ProductVariant.findByIdAndUpdate(
            item.variant,
            { $inc: { stockQuantity: item.quantity } },
            { session },
          );
        }
      }
    }

    order.status = nextStatus;
    await order.save({ session });

    const updatedOrderId = order._id;
    await session.commitTransaction();
    session.endSession();
    return updatedOrderId;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

async function applyStripeRefundFailed({
  paymentIntentId,
  stripeRefundId,
  amountMinor,
  currency,
} = {}) {
  const order = await Order.findOne({
    stripePaymentIntentId: paymentIntentId,
    $or: [
      { "refunds.stripeRefundId": stripeRefundId },
      { "refund.stripeRefundId": stripeRefundId },
    ],
  });

  if (!order) return null;

  order.refunds = Array.isArray(order.refunds) ? order.refunds : [];
  const record = order.refunds.find(
    (r) => r?.stripeRefundId === stripeRefundId,
  );
  if (record) {
    record.status = "failed";
    record.failedAt = record.failedAt || new Date();
    if (typeof amountMinor === "number" && Number.isFinite(amountMinor)) {
      record.amountMinor = Math.round(amountMinor);
      record.amount = toMajorUnits(
        record.amountMinor,
        record.currency || currency || order.currency,
      );
    }
  } else {
    const cur = currency || order.currency || "GBP";
    const minor =
      typeof amountMinor === "number" ? Math.round(amountMinor) : undefined;
    order.refunds.push({
      stripeRefundId,
      paymentIntentId,
      currency: cur,
      amountMinor: minor,
      amount: typeof minor === "number" ? toMajorUnits(minor, cur) : undefined,
      status: "failed",
      failedAt: new Date(),
      createdAt: new Date(),
      restock: false,
    });
  }

  // Legacy behavior: if we were in a simple refund_pending state and no refunds exist,
  // keep the previous "refund_failed" status.
  const succeededMinor = sumSucceededRefundedMinor(order);
  if (succeededMinor <= 0 && order.status === "refund_pending") {
    order.status = "refund_failed";
  } else {
    order.status = computeRefundDerivedOrderStatus(order);
  }

  await order.save();
  return order._id;
}

async function markRefundFailedByPaymentIntent(paymentIntentId) {
  // Back-compat: old webhook handler (no refund.id provided).
  await Order.findOneAndUpdate(
    {
      stripePaymentIntentId: paymentIntentId,
      status: "refund_pending",
    },
    { status: "refund_failed" },
  );
}

module.exports = {
  RefundOrder,
  finalizeRefundForOrderByPaymentIntent,
  markRefundFailedByPaymentIntent,
  applyStripeRefundSucceeded,
  applyStripeRefundFailed,
};
