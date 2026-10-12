const service = require("../services/deals.public.service");
const { sendOk, sendErr } = require("../utils/response.util");

const ListDeals = async (req, res) => {
  const result = await service.listActiveDeals({
    page: Number(req.query.page || 1),
    pageSize: Number(req.query.pageSize || 24),
    featured: req.query.featured,
  });

  return sendOk(res, result.data, { meta: result.meta });
};

const GetDeal = async (req, res) => {
  const result = await service.getActiveDealBySlug({ slug: req.params.slug });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 404,
      message: result.message || "Deal not found",
    });
  }

  return sendOk(res, result.data);
};

module.exports = {
  ListDeals,
  GetDeal,
};
