"use strict";

const supportService = require("../../services/customerPortal/customerSupport.service");
const { sendOk, sendCreated, sendErr } = require("../../utils/response.util");

const CreateSupportRequest = async (req, res) => {
  const result = await supportService.CreateSupportRequest({
    customerId: req.customer._id,
    ...req.body,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendCreated(res, result.data, { message: result.message });
};

const ListSupportRequests = async (req, res) => {
  const result = await supportService.ListSupportRequests({
    customerId: req.customer._id,
    status: req.query.status,
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
  });
  return sendOk(res, result.data);
};

const GetSupportRequest = async (req, res) => {
  const result = await supportService.GetSupportRequest({
    customerId: req.customer._id,
    requestId: req.params.supportRequestId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, result.data);
};

module.exports = {
  CreateSupportRequest,
  ListSupportRequests,
  GetSupportRequest,
};
