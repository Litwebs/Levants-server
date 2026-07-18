"use strict";

const service = require("../../services/customerPortal/customerSubscriptions.service");
const { sendOk, sendCreated, sendErr } = require("../../utils/response.util");

const CreateSubscription = async (req, res) => {
  const result = await service.CreateSubscription({
    customerId: req.customer._id,
    ...req.body,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendCreated(res, result.data, { message: result.message });
};

const ListSubscriptions = async (req, res) => {
  const result = await service.ListSubscriptions({
    customerId: req.customer._id,
    status: req.query.status,
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
  });
  return sendOk(res, result.data);
};

const GetSubscriptionSettings = async (req, res) => {
  const result = await service.GetSubscriptionSettingsForCustomer();
  return sendOk(res, result.data);
};

const GetSubscription = async (req, res) => {
  const result = await service.GetSubscription({
    customerId: req.customer._id,
    subscriptionId: req.params.subscriptionId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, result.data);
};

const UpdateSubscription = async (req, res) => {
  const result = await service.UpdateSubscription({
    customerId: req.customer._id,
    subscriptionId: req.params.subscriptionId,
    ...req.body,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const PauseSubscription = async (req, res) => {
  const result = await service.PauseSubscription({
    customerId: req.customer._id,
    subscriptionId: req.params.subscriptionId,
    resumeOn: req.body?.resumeOn,
    refundMethod: req.body?.refundMethod,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const ResumeSubscription = async (req, res) => {
  const result = await service.ResumeSubscription({
    customerId: req.customer._id,
    subscriptionId: req.params.subscriptionId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const CancelSubscription = async (req, res) => {
  const result = await service.CancelSubscription({
    customerId: req.customer._id,
    subscriptionId: req.params.subscriptionId,
    reason: req.body?.reason,
    refundMethod: req.body?.refundMethod,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const AddSubscriptionItem = async (req, res) => {
  const result = await service.AddSubscriptionItem({
    customerId: req.customer._id,
    subscriptionId: req.params.subscriptionId,
    variantId: req.body.variantId,
    quantity: req.body.quantity,
    refundMethod: req.body.refundMethod,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const UpdateSubscriptionItem = async (req, res) => {
  const result = await service.UpdateSubscriptionItem({
    customerId: req.customer._id,
    subscriptionId: req.params.subscriptionId,
    itemId: req.params.itemId,
    quantity: req.body.quantity,
    refundMethod: req.body.refundMethod,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const RemoveSubscriptionItem = async (req, res) => {
  const result = await service.RemoveSubscriptionItem({
    customerId: req.customer._id,
    subscriptionId: req.params.subscriptionId,
    itemId: req.params.itemId,
    refundMethod: req.body?.refundMethod,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const GetSubscriptionDeliveries = async (req, res) => {
  const result = await service.GetSubscriptionDeliveries({
    customerId: req.customer._id,
    subscriptionId: req.params.subscriptionId,
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, result.data);
};

module.exports = {
  CreateSubscription,
  ListSubscriptions,
  GetSubscription,
  GetSubscriptionSettings,
  UpdateSubscription,
  PauseSubscription,
  ResumeSubscription,
  CancelSubscription,
  AddSubscriptionItem,
  UpdateSubscriptionItem,
  RemoveSubscriptionItem,
  GetSubscriptionDeliveries,
};
