"use strict";

const notifService = require("../../services/customerPortal/customerNotifications.service");
const { sendOk, sendErr } = require("../../utils/response.util");

const ListNotifications = async (req, res) => {
  const result = await notifService.ListNotifications({
    customerId: req.customer._id,
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
  });
  return sendOk(res, result.data);
};

const MarkAsRead = async (req, res) => {
  const result = await notifService.MarkAsRead({
    customerId: req.customer._id,
    notificationId: req.params.notificationId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const MarkAllAsRead = async (req, res) => {
  await notifService.MarkAllAsRead({ customerId: req.customer._id });
  return sendOk(res, null, { message: "All notifications marked as read" });
};

module.exports = { ListNotifications, MarkAsRead, MarkAllAsRead };
