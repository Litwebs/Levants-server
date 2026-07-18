"use strict";

const paymentService = require("../../services/customerPortal/customerPayments.service");
const { sendOk, sendErr } = require("../../utils/response.util");

const GetStripeConfig = async (req, res) => {
  const result = await paymentService.GetStripeConfig();
  if (!result.success)
    return sendErr(res, { statusCode: 500, message: result.message });
  return sendOk(res, result.data);
};

const CreateSetupIntent = async (req, res) => {
  const result = await paymentService.CreateSetupIntent({
    customerId: req.customer._id,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data);
};

const AttachPaymentMethod = async (req, res) => {
  const result = await paymentService.AttachPaymentMethod({
    customerId: req.customer._id,
    stripePaymentMethodId: req.body?.stripePaymentMethodId,
    setDefault: req.body?.setDefault,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const ListPayments = async (req, res) => {
  const result = await paymentService.ListPayments({
    customerId: req.customer._id,
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
  });
  return sendOk(res, result.data);
};

const ListPaymentMethods = async (req, res) => {
  const result = await paymentService.ListPaymentMethods({
    customerId: req.customer._id,
  });
  return sendOk(res, result.data);
};

const SetDefaultPaymentMethod = async (req, res) => {
  const result = await paymentService.SetDefaultPaymentMethod({
    customerId: req.customer._id,
    paymentMethodId: req.params.paymentMethodId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const DeletePaymentMethod = async (req, res) => {
  const result = await paymentService.DeletePaymentMethod({
    customerId: req.customer._id,
    paymentMethodId: req.params.paymentMethodId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, null, { message: result.message });
};

module.exports = {
  GetStripeConfig,
  CreateSetupIntent,
  AttachPaymentMethod,
  ListPayments,
  ListPaymentMethods,
  SetDefaultPaymentMethod,
  DeletePaymentMethod,
};
