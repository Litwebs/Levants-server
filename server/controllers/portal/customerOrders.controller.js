"use strict";

const ordersService = require("../../services/customerPortal/customerOrders.service");
const { sendOk, sendCreated, sendErr } = require("../../utils/response.util");

const PlaceOrder = async (req, res) => {
  const result = await ordersService.PlaceOrder({
    customerId: req.customer._id,
    ...req.body,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendCreated(res, result.data, { message: result.message });
};

const ListOrders = async (req, res) => {
  const { page, pageSize, status } = req.query;
  const result = await ordersService.ListOrders({
    customerId: req.customer._id,
    page: Number(page) || 1,
    pageSize: Number(pageSize) || 20,
    status,
  });
  return sendOk(res, result.data);
};

const GetOrder = async (req, res) => {
  const result = await ordersService.GetOrder({
    customerId: req.customer._id,
    orderId: req.params.orderId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, result.data);
};

const CancelOrder = async (req, res) => {
  const result = await ordersService.CancelOrder({
    customerId: req.customer._id,
    orderId: req.params.orderId,
    reason: req.body?.reason,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const Reorder = async (req, res) => {
  const result = await ordersService.Reorder({
    customerId: req.customer._id,
    orderId: req.params.orderId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendCreated(res, result.data, { message: "Reorder placed" });
};

module.exports = { PlaceOrder, ListOrders, GetOrder, CancelOrder, Reorder };
