"use strict";

const supportService = require("../../services/customerPortal/customerSupport.service");
const { sendOk, sendErr } = require("../../utils/response.util");
const { validateBody } = require("../../middleware/validate.middleware");

const ListSupportRequests = async (req, res) => {
  const result = await supportService.AdminListSupportRequests({
    status: req.query.status,
    search: req.query.search,
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
  });
  return sendOk(res, result.data);
};

const GetSupportRequest = async (req, res) => {
  const result = await supportService.AdminGetSupportRequest({
    requestId: req.params.supportRequestId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, result.data);
};

const UpdateSupportRequest = async (req, res) => {
  const result = await supportService.AdminUpdateSupportRequest({
    requestId: req.params.supportRequestId,
    status: req.body.status,
    assignedTo: req.body.assignedTo,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const AddNote = async (req, res) => {
  const result = await supportService.AdminAddNote({
    requestId: req.params.supportRequestId,
    authorId: req.user.id,
    content: req.body.content,
    isInternal: req.body.isInternal !== false,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

module.exports = {
  ListSupportRequests,
  GetSupportRequest,
  UpdateSupportRequest,
  AddNote,
};
