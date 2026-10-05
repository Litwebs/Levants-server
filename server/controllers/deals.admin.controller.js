const service = require("../services/deals.admin.service");
const { sendOk, sendCreated, sendErr } = require("../utils/response.util");

const CreateDeal = async (req, res) => {
  const result = await service.createDeal({
    body: req.body,
    userId: req.user?._id,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to create deal",
    });
  }

  return sendCreated(res, result.data);
};

const ListDeals = async (req, res) => {
  const result = await service.listDeals({
    page: Number(req.query.page || 1),
    pageSize: Number(req.query.pageSize || 20),
    featured: req.query.featured,
  });

  return sendOk(res, result.data, { meta: result.meta });
};

const GetDeal = async (req, res) => {
  const result = await service.getDeal({ dealId: req.params.dealId });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to load deal",
    });
  }

  return sendOk(res, result.data);
};

const UpdateDeal = async (req, res) => {
  const result = await service.updateDeal({
    dealId: req.params.dealId,
    body: req.body,
    userId: req.user?._id,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to update deal",
    });
  }

  return sendOk(res, result.data);
};

const DeactivateDeal = async (req, res) => {
  const result = await service.deactivateDeal({ dealId: req.params.dealId });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to deactivate deal",
    });
  }

  return sendOk(res, result.data);
};

const ArchiveDeal = async (req, res) => {
  const result = await service.archiveDeal({ dealId: req.params.dealId });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to archive deal",
    });
  }

  return sendOk(res, result.data);
};

module.exports = {
  CreateDeal,
  ListDeals,
  GetDeal,
  UpdateDeal,
  DeactivateDeal,
  ArchiveDeal,
};
