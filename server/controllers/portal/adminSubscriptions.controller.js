"use strict";

const adminSubService = require("../../services/customerPortal/adminSubscriptions.service");
const { sendOk, sendCreated, sendErr } = require("../../utils/response.util");

const ListSubscriptions = async (req, res) => {
  const result = await adminSubService.AdminListSubscriptions({
    status: req.query.status,
    frequency: req.query.frequency,
    search: req.query.search,
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
  });
  return sendOk(res, result.data);
};

const GetSubscription = async (req, res) => {
  const result = await adminSubService.AdminGetSubscription({
    subscriptionId: req.params.subscriptionId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, result.data);
};

const PauseSubscription = async (req, res) => {
  const result = await adminSubService.AdminPauseSubscription({
    subscriptionId: req.params.subscriptionId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const ResumeSubscription = async (req, res) => {
  const result = await adminSubService.AdminResumeSubscription({
    subscriptionId: req.params.subscriptionId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const CancelSubscription = async (req, res) => {
  const result = await adminSubService.AdminCancelSubscription({
    subscriptionId: req.params.subscriptionId,
    reason: req.body?.reason,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const UpdateSubscription = async (req, res) => {
  const result = await adminSubService.AdminUpdateSubscription({
    subscriptionId: req.params.subscriptionId,
    ...req.body,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const AddSubscriptionItem = async (req, res) => {
  const result = await adminSubService.AdminAddSubscriptionItem({
    subscriptionId: req.params.subscriptionId,
    variantId: req.body.variantId,
    quantity: req.body.quantity,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const UpdateSubscriptionItem = async (req, res) => {
  const result = await adminSubService.AdminUpdateSubscriptionItem({
    subscriptionId: req.params.subscriptionId,
    itemId: req.params.itemId,
    quantity: req.body.quantity,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const RemoveSubscriptionItem = async (req, res) => {
  const result = await adminSubService.AdminRemoveSubscriptionItem({
    subscriptionId: req.params.subscriptionId,
    itemId: req.params.itemId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const GetSubscriptionDeliveries = async (req, res) => {
  const result = await adminSubService.AdminGetSubscriptionDeliveries({
    subscriptionId: req.params.subscriptionId,
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
  });
  return sendOk(res, result.data);
};

const GetSubscriptionOrders = async (req, res) => {
  const result = await adminSubService.AdminGetSubscriptionOrders({
    subscriptionId: req.params.subscriptionId,
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
  });
  return sendOk(res, result.data);
};

module.exports = {
  ListSubscriptions,
  GetSubscription,
  PauseSubscription,
  ResumeSubscription,
  CancelSubscription,
  UpdateSubscription,
  AddSubscriptionItem,
  UpdateSubscriptionItem,
  RemoveSubscriptionItem,
  GetSubscriptionDeliveries,
  GetSubscriptionOrders,
};
