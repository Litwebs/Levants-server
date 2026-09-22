const crypto = require("crypto");
const Role = require("../../models/role.model");
const User = require("../../models/user.model");
const Order = require("../../models/order.model");
const Customer = require("../../models/customer.model");
const sendEmail = require("../../Integration/Email.service");
const { FRONTEND_URL } = require("../../config/env");
const { normalizeBaseUrl } = require("../../utils/navigation.util");

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function isValidEmail(raw) {
  const email = String(raw || "").trim();
  if (!email) return false;
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildDashboardUrl() {
  return normalizeBaseUrl(FRONTEND_URL);
}

async function findRecipientUsersForNewOrders() {
  const permissions = ["*", "orders.read", "orders.*"];

  const roles = await Role.find({
    permissions: { $in: permissions },
    name: { $ne: "driver" },
  })
    .select("_id")
    .lean();

  const roleIds = roles.map((r) => r._id);
  if (roleIds.length === 0) return [];

  return User.find({
    role: { $in: roleIds },
    status: "active",
    "preferences.notifications.newOrders": true,
  })
    .select("email name")
    .lean();
}

async function sendNewOrderAlertEmailToUsers({ orderId }) {
  if (!orderId) return { success: false, message: "orderId is required" };

  const order = await Order.findById(orderId).lean();
  if (!order) return { success: false, message: "Order not found" };

  const customer = await Customer.findById(order.customer)
    .select("firstName lastName email")
    .lean();

  const recipients = await findRecipientUsersForNewOrders();
  const emails = recipients
    .map((u) => String(u.email || "").trim())
    .filter(Boolean);

  if (emails.length === 0) {
    return { success: true, data: { sent: 0 } };
  }

  const customerName = customer
    ? `${customer.firstName || ""} ${customer.lastName || ""}`.trim()
    : "";

  const templateParams = {
    orderId: order.orderId || order._id?.toString(),
    customerName,
    customerEmail: customer?.email,
    total: order.total,
    currency: order.currency || "GBP",
    orderDate: order.createdAt
      ? new Date(order.createdAt).toLocaleString("en-GB", {
          timeZone: "Europe/London",
        })
      : undefined,
    items: (order.items || []).map((i) => ({
      name: i.name,
      quantity: i.quantity,
      subtotal: i.subtotal,
    })),
    dashboardUrl: buildDashboardUrl() || undefined,
  };

  const subject = `New Order Alert${order.orderId ? ` – ${order.orderId}` : ""}`;

  // IMPORTANT:
  // Resend enforces strict rate limits (e.g. 2 req/sec on some plans).
  // If we send one email per admin user, bursts can trigger 429s and cause
  // customer confirmations to be delayed or dropped.
  // Use a single request with BCC to keep admin recipients private.
  let result;
  try {
    if (emails.length === 1) {
      result = await sendEmail(
        emails[0],
        subject,
        "newOrderAlert",
        templateParams,
      );
    } else {
      result = await sendEmail(
        emails[0],
        subject,
        "newOrderAlert",
        templateParams,
        { bcc: emails.slice(1) },
      );
    }
  } catch (e) {
    result = { success: false, error: e };
  }

  const sent = result && result.success ? emails.length : 0;

  // Best-effort marker for idempotency
  try {
    await Order.updateOne(
      { _id: order._id },
      { $set: { "metadata.newOrderAlertSentAt": new Date().toISOString() } },
    );
  } catch {
    // ignore
  }

  return { success: true, data: { sent } };
}

async function releaseOrderConfirmationClaim(orderId, claimToken) {
  try {
    await Order.updateOne(
      {
        _id: orderId,
        "metadata.orderConfirmationClaim": claimToken,
      },
      {
        $unset: {
          "metadata.orderConfirmationClaim": 1,
          "metadata.orderConfirmationClaimedAt": 1,
        },
      },
    );
  } catch {
    // A stale claim is recoverable after the timeout below.
  }
}

async function sendOrderConfirmationEmailToCustomer({ orderId }) {
  if (!orderId) return { success: false, message: "orderId is required" };

  const existing = await Order.findById(orderId).lean();
  if (!existing) return { success: false, message: "Order not found" };

  if (existing.status !== "paid") {
    console.warn("[orders] confirmation email skipped (status not paid)", {
      orderId: existing._id?.toString?.() || String(orderId),
      status: existing.status,
    });
    return { success: true, data: { skipped: true, reason: "not_paid" } };
  }

  if (existing?.metadata?.orderConfirmationSentAt) {
    return { success: true, data: { skipped: true, reason: "already_sent" } };
  }

  // Claim the send atomically so the Stripe webhook and browser reconciliation
  // cannot send the same confirmation at the same time. A stale claim can be
  // reclaimed after five minutes if a process died mid-send.
  const claimToken = crypto.randomUUID();
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const claimed = await Order.findOneAndUpdate(
    {
      _id: existing._id,
      status: "paid",
      "metadata.orderConfirmationSentAt": { $exists: false },
      $or: [
        { "metadata.orderConfirmationClaim": { $exists: false } },
        { "metadata.orderConfirmationClaimedAt": { $lte: staleBefore } },
      ],
    },
    {
      $set: {
        "metadata.orderConfirmationClaim": claimToken,
        "metadata.orderConfirmationClaimedAt": new Date().toISOString(),
      },
    },
    { new: true },
  ).lean();

  if (!claimed) {
    const latest = await Order.findById(orderId).lean();
    if (latest?.metadata?.orderConfirmationSentAt) {
      return { success: true, data: { skipped: true, reason: "already_sent" } };
    }
    return { success: true, data: { skipped: true, reason: "in_progress" } };
  }

  const customer = await Customer.findById(claimed.customer)
    .select("firstName lastName email")
    .lean();

  const to = String(customer?.email || "").trim();
  if (!to) {
    await releaseOrderConfirmationClaim(claimed._id, claimToken);
    return { success: false, message: "Customer email not found" };
  }

  if (!isValidEmail(to)) {
    console.warn(
      "[orders] confirmation email skipped (invalid customer email)",
      {
        orderId: claimed._id?.toString?.() || String(orderId),
        to,
      },
    );
    await releaseOrderConfirmationClaim(claimed._id, claimToken);
    return { success: true, data: { skipped: true, reason: "invalid_email" } };
  }

  const customerName = customer
    ? `${customer.firstName || ""} ${customer.lastName || ""}`.trim()
    : "";

  const templateParams = {
    name: customerName || "there",
    orderId: claimed.orderId || claimed._id?.toString(),
    items: (claimed.items || []).map((i) => ({
      name: i.name,
      quantity: i.quantity,
      subtotal: formatMoney(i.subtotal),
    })),
    total: formatMoney(claimed.total),
    currency: claimed.currency || "GBP",
    orderDate:
      claimed.paidAt || claimed.createdAt
        ? new Date(claimed.paidAt || claimed.createdAt).toLocaleString("en-GB", {
            timeZone: "Europe/London",
          })
        : undefined,
    billingAddress: undefined,
    shippingAddress: undefined,
  };

  const subject = `Order Confirmation${claimed.orderId ? ` – ${claimed.orderId}` : ""}`;

  let result;
  try {
    result = await sendEmail(
      to,
      subject,
      "orderConfirmation",
      templateParams,
    );
  } catch (error) {
    await releaseOrderConfirmationClaim(claimed._id, claimToken);
    throw error;
  }

  if (!result || result.success !== true) {
    console.error("[orders] confirmation email send failed", {
      orderId: claimed._id?.toString?.() || String(orderId),
      to,
      error:
        result?.error?.message || result?.message || result?.error || "unknown",
    });
    await releaseOrderConfirmationClaim(claimed._id, claimToken);
    return result;
  }

  try {
    await Order.updateOne(
      {
        _id: claimed._id,
        "metadata.orderConfirmationClaim": claimToken,
      },
      {
        $set: {
          "metadata.orderConfirmationSentAt": new Date().toISOString(),
        },
        $unset: {
          "metadata.orderConfirmationClaim": 1,
          "metadata.orderConfirmationClaimedAt": 1,
        },
      },
    );
  } catch {
    // Provider accepted the email; do not turn the paid order into an error.
  }

  return result;
}

async function sendRefundConfirmationEmailToCustomer({ orderId }) {
  if (!orderId) return { success: false, message: "orderId is required" };

  const order = await Order.findById(orderId).lean();
  if (!order) return { success: false, message: "Order not found" };

  // Only send when refund is completed
  if (order.status !== "refunded") {
    return { success: true, data: { skipped: true, reason: "not_refunded" } };
  }

  // Idempotency
  const alreadySentAt = order?.metadata?.refundConfirmationSentAt;
  if (alreadySentAt) {
    return { success: true, data: { skipped: true, reason: "already_sent" } };
  }

  const customer = await Customer.findById(order.customer)
    .select("firstName lastName email")
    .lean();

  const to = String(customer?.email || "").trim();
  if (!to) {
    return { success: false, message: "Customer email not found" };
  }

  const customerName = customer
    ? `${customer.firstName || ""} ${customer.lastName || ""}`.trim()
    : "";

  const refundedAt = order?.refund?.refundedAt || null;
  const templateParams = {
    name: customerName || "there",
    orderId: order.orderId || order._id?.toString(),
    refundDate: refundedAt
      ? new Date(refundedAt).toLocaleString("en-GB")
      : undefined,
    total: formatMoney(order.total),
    currency: order.currency || "GBP",
  };

  const subject = `Refund Confirmation${order.orderId ? ` – ${order.orderId}` : ""}`;

  const result = await sendEmail(
    to,
    subject,
    "refundConfirmation",
    templateParams,
  );

  if (result && result.success) {
    try {
      await Order.updateOne(
        { _id: order._id },
        {
          $set: {
            "metadata.refundConfirmationSentAt": new Date().toISOString(),
          },
        },
      );
    } catch {
      // ignore
    }
  }

  return result;
}

module.exports = {
  sendNewOrderAlertEmailToUsers,
  sendOrderConfirmationEmailToCustomer,
  sendRefundConfirmationEmailToCustomer,
};
