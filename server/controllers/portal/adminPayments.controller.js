"use strict";

const paymentService = require("../../services/customerPortal/customerPayments.service");
const { sendOk, sendErr } = require("../../utils/response.util");

const ListPayments = async (req, res) => {
  const result = await paymentService.AdminListPayments({
    customerId: req.query.customerId,
    subscriptionId: req.query.subscriptionId,
    status: req.query.status,
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
  });
  return sendOk(res, result.data);
};

const GetPayment = async (req, res) => {
  const result = await paymentService.AdminGetPayment({
    paymentId: req.params.paymentId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, result.data);
};

const UpdatePaymentStatus = async (req, res) => {
  const result = await paymentService.AdminUpdatePaymentStatus({
    paymentId: req.params.paymentId,
    status: req.body.status,
    notes: req.body.notes,
    updatedBy: req.user.id,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

module.exports = { ListPayments, GetPayment, UpdatePaymentStatus };
