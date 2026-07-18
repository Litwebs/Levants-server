"use strict";

const SupportRequest = require("../../models/supportRequest.model");
const CustomerNotification = require("../../models/customerNotification.model");
const { Response } = require("../../utils/response.util");

/**
 * Create a support request.
 */
async function CreateSupportRequest({
  customerId,
  issueType,
  subject,
  message,
  relatedOrderId,
  relatedSubscriptionId,
} = {}) {
  const request = await SupportRequest.create({
    customer: customerId,
    issueType,
    subject,
    message,
    relatedOrder: relatedOrderId || null,
    relatedSubscription: relatedSubscriptionId || null,
    status: "open",
  });

  return Response(true, "Support request submitted", { request });
}

/**
 * List a customer's support requests.
 */
async function ListSupportRequests({
  customerId,
  status,
  page = 1,
  pageSize = 20,
} = {}) {
  const filter = { customer: customerId };
  if (status) filter.status = status;

  const total = await SupportRequest.countDocuments(filter);
  const requests = await SupportRequest.find(filter)
    .populate("relatedOrder", "orderId status")
    .populate("relatedSubscription", "subscriptionNumber status")
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  return Response(true, null, { requests, meta: { page, pageSize, total } });
}

/**
 * Get a single support request (customer-owned).
 */
async function GetSupportRequest({ customerId, requestId } = {}) {
  const request = await SupportRequest.findOne({
    _id: requestId,
    customer: customerId,
  })
    .populate("relatedOrder", "orderId status total")
    .populate("relatedSubscription", "subscriptionNumber status frequency")
    .lean();

  if (!request) return Response(false, "Support request not found", null);

  // Filter out internal notes from customer-facing view
  if (request.notes) {
    request.notes = request.notes.filter((n) => !n.isInternal);
  }

  return Response(true, null, { request });
}

// ===== Admin-facing functions =====

/**
 * List all support requests (admin).
 */
async function AdminListSupportRequests({
  status,
  search,
  page = 1,
  pageSize = 20,
} = {}) {
  const filter = {};
  if (status) filter.status = status;

  const total = await SupportRequest.countDocuments(filter);
  const requests = await SupportRequest.find(filter)
    .populate("customer", "firstName lastName email phone")
    .populate("relatedOrder", "orderId status")
    .populate("relatedSubscription", "subscriptionNumber status")
    .populate("assignedTo", "name email")
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  return Response(true, null, { requests, meta: { page, pageSize, total } });
}

/**
 * Get a single support request (admin).
 */
async function AdminGetSupportRequest({ requestId } = {}) {
  const request = await SupportRequest.findById(requestId)
    .populate("customer", "firstName lastName email phone")
    .populate("relatedOrder", "orderId status total")
    .populate("relatedSubscription", "subscriptionNumber status frequency")
    .populate("assignedTo", "name email")
    .populate("notes.author", "name email")
    .lean();

  if (!request) return Response(false, "Support request not found", null);
  return Response(true, null, { request });
}

/**
 * Update support request status / assignee (admin).
 */
async function AdminUpdateSupportRequest({
  requestId,
  status,
  assignedTo,
} = {}) {
  const request = await SupportRequest.findById(requestId);
  if (!request) return Response(false, "Support request not found", null);

  if (status) {
    request.status = status;
    if (status === "resolved" || status === "closed") {
      request.resolvedAt = new Date();
    }
  }
  if (assignedTo !== undefined) request.assignedTo = assignedTo || null;

  await request.save();

  // Notify customer when status changes
  if (status) {
    await CustomerNotification.create({
      customer: request.customer,
      type: "support_request_updated",
      title: "Support request updated",
      message: `Your support request "${request.subject}" has been updated to: ${status.replace("_", " ")}.`,
      relatedSupportRequest: request._id,
    });
  }

  return Response(true, "Support request updated", { request });
}

/**
 * Add an internal note (admin).
 */
async function AdminAddNote({
  requestId,
  authorId,
  content,
  isInternal = true,
} = {}) {
  const request = await SupportRequest.findById(requestId);
  if (!request) return Response(false, "Support request not found", null);

  request.notes.push({ author: authorId, content, isInternal });
  await request.save();

  return Response(true, "Note added", { request });
}

module.exports = {
  CreateSupportRequest,
  ListSupportRequests,
  GetSupportRequest,
  AdminListSupportRequests,
  AdminGetSupportRequest,
  AdminUpdateSupportRequest,
  AdminAddNote,
};
