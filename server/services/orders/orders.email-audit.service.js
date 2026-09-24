"use strict";

const { Resend } = require("resend");
const Order = require("../../models/order.model");
const { RESEND_EMAIL_KEY } = require("../../config/env");
const { buildActiveOrderIdQuery } = require("../../utils/ordersAdmin.util");

const resend = new Resend(RESEND_EMAIL_KEY);
const LEGACY_EMAILS = [
  ["newOrderAlert", "newOrderAlertSentAt", "newOrderAlertProviderId", "New order alert"],
  ["orderConfirmation", "orderConfirmationSentAt", "orderConfirmationProviderId", "Order confirmation"],
  ["orderDispatched", "dispatchedEmailSentAt", "dispatchedEmailProviderId", "Order dispatched"],
  ["deliveryProof", "deliveredEmailSentAt", "deliveredEmailProviderId", "Delivery confirmation"],
  ["refundConfirmation", "refundConfirmationSentAt", "refundConfirmationProviderId", "Refund confirmation"],
];

function resolvePreviewHtml(html, proofUrl) {
  if (typeof html !== "string") return html;
  const resolvedProofUrl = String(proofUrl || "").trim();
  return resolvedProofUrl
    ? html.replace(/cid:delivery-proof(?:-photo)?/gi, resolvedProofUrl)
    : html;
}

function localRecords(order) {
  const records = Array.isArray(order.emailLog)
    ? order.emailLog.map((entry) => ({
        template: entry.template,
        providerId: entry.providerId || null,
        subject: entry.subject,
        to: entry.to,
        sentAt: entry.sentAt,
        trigger: entry.trigger || null,
      }))
    : [];
  const known = new Set(records.map((record) => record.template));
  for (const [template, sentKey, idKey, label] of LEGACY_EMAILS) {
    if (!known.has(template) && order.metadata?.[sentKey]) {
      records.push({
        template,
        providerId: order.metadata?.[idKey] || null,
        subject: label,
        to: order.customer?.email || "",
        sentAt: order.metadata[sentKey],
        trigger: "legacy_record",
      });
    }
  }
  return records.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
}

async function GetOrderEmailAudit({ orderId }) {
  const order = await Order.findOne(buildActiveOrderIdQuery(orderId))
    .select("customer metadata emailLog")
    .populate("customer", "email")
    .lean();
  if (!order) return { success: false, statusCode: 404, message: "Order not found" };

  const emails = await Promise.all(localRecords(order).map(async (record) => {
    if (!record.providerId || !RESEND_EMAIL_KEY) {
      return { ...record, provider: null, providerStatus: record.providerId ? "unavailable" : "not_recorded" };
    }
    try {
      const response = await resend.emails.get(record.providerId);
      const data = response?.data;
      if (!data) return { ...record, provider: null, providerStatus: "unavailable" };
      const previewHtml = resolvePreviewHtml(
        data.html,
        order.metadata?.deliveryProofUrl,
      );
      return {
        ...record,
        providerStatus: data.last_event || "sent",
        provider: {
          id: data.id,
          from: data.from,
          to: data.to,
          cc: data.cc,
          bcc: data.bcc,
          replyTo: data.reply_to,
          subject: data.subject,
          createdAt: data.created_at,
          lastEvent: data.last_event,
          html: previewHtml,
          text: data.text,
          tags: data.tags || [],
        },
      };
    } catch (error) {
      return { ...record, provider: null, providerStatus: "unavailable", providerError: String(error?.message || "Resend metadata unavailable") };
    }
  }));
  return { success: true, data: { emails } };
}

module.exports = { GetOrderEmailAudit, resolvePreviewHtml };
