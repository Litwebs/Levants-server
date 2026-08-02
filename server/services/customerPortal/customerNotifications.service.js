"use strict";

const CustomerNotification = require("../../models/customerNotification.model");
const { Response } = require("../../utils/response.util");

/**
 * List notifications for a customer.
 */
async function ListNotifications({ customerId, page = 1, pageSize = 20 } = {}) {
  const filter = { customer: customerId };
  const total = await CustomerNotification.countDocuments(filter);
  const notifications = await CustomerNotification.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  const unreadCount = await CustomerNotification.countDocuments({
    customer: customerId,
    readAt: null,
  });

  return Response(true, null, {
    notifications,
    meta: { page, pageSize, total, unreadCount },
  });
}

/**
 * Mark a notification as read.
 */
async function MarkAsRead({ customerId, notificationId } = {}) {
  const notification = await CustomerNotification.findOne({
    _id: notificationId,
    customer: customerId,
  });
  if (!notification) return Response(false, "Notification not found", null);

  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }

  return Response(true, "Marked as read", { notification });
}

/**
 * Mark all notifications as read.
 */
async function MarkAllAsRead({ customerId } = {}) {
  await CustomerNotification.updateMany(
    { customer: customerId, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return Response(true, "All notifications marked as read", null);
}

/**
 * Create a notification (internal helper).
 */
async function CreateNotification({
  customerId,
  type,
  title,
  message,
  relatedOrder,
  relatedSubscription,
  relatedSupportRequest,
} = {}) {
  return CustomerNotification.create({
    customer: customerId,
    type,
    title,
    message,
    relatedOrder: relatedOrder || null,
    relatedSubscription: relatedSubscription || null,
    relatedSupportRequest: relatedSupportRequest || null,
  });
}

module.exports = {
  ListNotifications,
  MarkAsRead,
  MarkAllAsRead,
  CreateNotification,
};
