const service = require("../services/discounts.public.service");
const { sendOk, sendErr } = require("../utils/response.util");

const ValidateDiscount = async (req, res) => {
  const result = await service.validateDiscountForCart({
    customerId: req.body.customerId,
    discountCode: req.body.discountCode,
    items: req.body.items,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to validate discount",
    });
  }

  return sendOk(res, result.data);
};

const ListActiveDiscounts = async (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 50);

  const result = await service.listActiveDiscounts({ page, pageSize });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to load discounts",
    });
  }

  return sendOk(res, { items: result.data.items }, { meta: result.meta });
};

module.exports = {
  ValidateDiscount,
  ListActiveDiscounts,
};
