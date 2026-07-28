"use strict";

const Customer = require("../../models/customer.model");
const sendEmail = require("../../Integration/Email.service");

function customerName(customer) {
  return [customer?.firstName, customer?.lastName].filter(Boolean).join(" ").trim() || "Customer";
}

function portalUrl(subscription) {
  const origin = String(
    process.env.CLIENT_FRONT_URL_PROD ||
      process.env.FRONTEND_URL_PROD ||
      process.env.CLIENT_FRONT_URL_DEV ||
      process.env.FRONTEND_URL_DEV ||
      "",
  ).replace(/\/$/, "");
  return origin && subscription?._id
    ? `${origin}/portal/subscriptions/${subscription._id}`
    : "";
}

async function sendSubscriptionUpdateEmail({
  customer: customerInput,
  customerId,
  subscription,
  title,
  message,
  subject,
} = {}) {
  try {
    const customer = customerInput || (customerId ? await Customer.findById(customerId).lean() : null);
    if (!customer?.email) return { sent: false, reason: "missing_customer_email" };
    if (customer.notificationPreferences?.subscriptionUpdates === false) {
      return { sent: false, reason: "preference_disabled" };
    }

    const result = await sendEmail(
      customer.email,
      subject || title || "Subscription update",
      "subscriptionUpdate",
      {
        customerName: customerName(customer),
        title: title || "Subscription update",
        message: message || "Your subscription has been updated.",
        subscriptionNumber: subscription?.subscriptionNumber || "",
        portalUrl: portalUrl(subscription),
      },
    );

    if (!result?.success) {
      console.error("[subscription email] Send failed:", result?.error?.message || result?.error || "unknown error");
      return { sent: false, reason: "provider_failure" };
    }
    return { sent: true };
  } catch (error) {
    console.error("[subscription email] Unexpected failure:", error?.message || error);
    return { sent: false, reason: "unexpected_failure" };
  }
}

module.exports = { sendSubscriptionUpdateEmail };
