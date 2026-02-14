const service = require("../services/discounts.admin.service");
const { sendOk, sendErr } = require("../utils/response.util");

const CreateDiscount = async (req, res) => {
  const result = await service.CreateDiscount({
    body: req.body,
    userId: req.user?._id,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to create discount",
    });
  }

  return sendOk(res, result.data);
};

const ListDiscounts = async (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);

  const result = await service.ListDiscounts({ page, pageSize });
  return sendOk(res, result.data, { meta: result.meta });
};

const GetDiscountDetails = async (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);

  const result = await service.GetDiscountDetails({
    discountId: req.params.discountId,
    page,
    pageSize,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to load discount details",
    });
  }

  return sendOk(res, result.data, { meta: result.meta });
};

const DeactivateDiscount = async (req, res) => {
  const result = await service.DeactivateDiscount({
    discountId: req.params.discountId,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to deactivate discount",
    });
  }

  return sendOk(res, result.data);
};

module.exports = {
  CreateDiscount,
  ListDiscounts,
  GetDiscountDetails,
  DeactivateDiscount,
};
