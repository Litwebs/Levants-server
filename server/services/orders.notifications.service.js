const Role = require("../models/role.model");
const User = require("../models/user.model");
const Order = require("../models/order.model");
const Customer = require("../models/customer.model");
const sendEmail = require("../Integration/Email.service");
const { FRONTEND_URL } = require("../config/env");

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

function normalizeBaseUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, "");

  if (process.env.NODE_ENV !== "production") {
    return `http://${value.replace(/\/$/, "")}`;
  }

  return value.replace(/\/$/, "");
}

function buildDashboardUrl() {
  return normalizeBaseUrl(FRONTEND_URL);
}

async function findRecipientUsersForNewOrders() {
  const permissions = ["*", "orders.read", "orders.*"];

  const roles = await Role.find({
    permissions: { $in: permissions },
    status: "active",
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
      ? new Date(order.createdAt).toLocaleString("en-GB")
      : undefined,
    items: (order.items || []).map((i) => ({
      name: i.name,
      quantity: i.quantity,
      subtotal: i.subtotal,
    })),
    dashboardUrl: buildDashboardUrl() || undefined,
  };

  const subject = `New Order Alert${order.orderId ? ` – ${order.orderId}` : ""}`;

  const results = await Promise.all(
    emails.map(async (to) => {
      try {
        return await sendEmail(to, subject, "newOrderAlert", templateParams);
      } catch (e) {
        return { success: false, error: e };
      }
    }),
  );

  const sent = results.filter((r) => r && r.success).length;

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

async function sendOrderConfirmationEmailToCustomer({ orderId }) {
  if (!orderId) return { success: false, message: "orderId is required" };

  const order = await Order.findById(orderId).lean();
  if (!order) return { success: false, message: "Order not found" };

  // Only send confirmations for successful orders
  if (order.status !== "paid") {
    // This is commonly the root cause when customers report missing confirmations.
    // Keep it best-effort, but log for debugging.
    console.warn("[orders] confirmation email skipped (status not paid)", {
      orderId: order._id?.toString?.() || String(orderId),
      status: order.status,
    });
    return { success: true, data: { skipped: true, reason: "not_paid" } };
  }

  // Idempotency: skip if we've already sent it
  const alreadySentAt = order?.metadata?.orderConfirmationSentAt;
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

  if (!isValidEmail(to)) {
    console.warn(
      "[orders] confirmation email skipped (invalid customer email)",
      {
        orderId: order._id?.toString?.() || String(orderId),
        to,
      },
    );
    return { success: true, data: { skipped: true, reason: "invalid_email" } };
  }

  const customerName = customer
    ? `${customer.firstName || ""} ${customer.lastName || ""}`.trim()
    : "";

  const templateParams = {
    name: customerName || "there",
    orderId: order.orderId || order._id?.toString(),
    items: (order.items || []).map((i) => ({
      name: i.name,
      quantity: i.quantity,
      subtotal: formatMoney(i.subtotal),
    })),
    total: formatMoney(order.total),
    currency: order.currency || "GBP",
    orderDate:
      order.paidAt || order.createdAt
        ? new Date(order.paidAt || order.createdAt).toLocaleString("en-GB")
        : undefined,
    // Addresses are currently not persisted on the order/customer model
    billingAddress: undefined,
    shippingAddress: undefined,
  };

  const subject = `Order Confirmation${order.orderId ? ` – ${order.orderId}` : ""}`;

  const result = await sendEmail(
    to,
    subject,
    "orderConfirmation",
    templateParams,
  );

  if (!result || result.success !== true) {
    console.error("[orders] confirmation email send failed", {
      orderId: order._id?.toString?.() || String(orderId),
      to,
      error:
        result?.error?.message || result?.message || result?.error || "unknown",
    });
  }

  if (result && result.success) {
    // Best-effort marker for idempotency
    try {
      await Order.updateOne(
        { _id: order._id },
        {
          $set: {
            "metadata.orderConfirmationSentAt": new Date().toISOString(),
          },
        },
      );
    } catch {
      // ignore
    }
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
