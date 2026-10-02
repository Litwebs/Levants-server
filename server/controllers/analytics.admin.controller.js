const service = require("../services/analytics.admin.service");
const { sendOk, sendErr } = require("../utils/response.util");

const GetSummary = async (req, res) => {
  const result = await service.GetSummary({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetSummaryComparison = async (req, res) => {
  const result = await service.GetSummaryComparison({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetRevenueComposition = async (req, res) => {
  const result = await service.GetRevenueComposition({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetSalesBreakdown = async (req, res) => {
  const result = await service.GetSalesBreakdown({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetSalesTrends = async (req, res) => {
  const result = await service.GetSalesTrends({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    interval: req.query.interval,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetRevenueSeries = async (req, res) => {
  const result = await service.GetRevenueSeries({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    interval: req.query.interval,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetRevenueOverview = async (req, res) => {
  const result = await service.GetRevenueOverview({
    days: req.query.days,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetTopProducts = async (req, res) => {
  const result = await service.GetTopProducts({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    limit: req.query.limit,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetVariantUnits = async (req, res) => {
  const result = await service.GetVariantUnits({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    limit: req.query.limit,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetVariantRevenue = async (req, res) => {
  const result = await service.GetVariantRevenue({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    limit: req.query.limit,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetVariantRealisedPrice = async (req, res) => {
  const result = await service.GetVariantRealisedPrice({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    limit: req.query.limit,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetVariantPriceComparison = async (req, res) => {
  const result = await service.GetVariantPriceComparison({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    limit: req.query.limit,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetVariantSalesMix = async (req, res) => {
  const result = await service.GetVariantSalesMix({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    limit: req.query.limit,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetVariantContribution = async (req, res) => {
  const result = await service.GetVariantContribution({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    limit: req.query.limit,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetVariantTrends = async (req, res) => {
  const result = await service.GetVariantTrends({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    interval: req.query.interval,
    limit: req.query.limit,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetProductTrends = async (req, res) => {
  const result = await service.GetProductTrends({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    interval: req.query.interval,
    limit: req.query.limit,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetProductDetail = async (req, res) => {
  const result = await service.GetProductDetail({
    productId: req.params.productId,
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    interval: req.query.interval,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetRecentOrders = async (req, res) => {
  const result = await service.GetRecentOrders({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    limit: req.query.limit,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetLowStock = async (req, res) => {
  const result = await service.GetLowStock({
    limit: req.query.limit,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetOrderStatusCounts = async (req, res) => {
  const result = await service.GetOrderStatusCounts({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

const GetNavCounts = async (_req, res) => {
  const result = await service.GetNavCounts();
  if (!result.success) {
    return sendErr(res, {
      statusCode: 500,
      message: result.message || "Request failed",
    });
  }
  return sendOk(res, result.data);
};

const GetDashboard = async (req, res) => {
  const result = await service.GetDashboard({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
    interval: req.query.interval,
    orderSource: req.query.orderSource,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Request failed",
    });
  }

  return sendOk(res, result.data);
};

module.exports = {
  GetSummary,
  GetSummaryComparison,
  GetRevenueComposition,
  GetSalesBreakdown,
  GetSalesTrends,
  GetRevenueSeries,
  GetRevenueOverview,
  GetOrderStatusCounts,
  GetTopProducts,
  GetVariantUnits,
  GetVariantRevenue,
  GetVariantRealisedPrice,
  GetVariantPriceComparison,
  GetVariantSalesMix,
  GetVariantContribution,
  GetVariantTrends,
  GetProductTrends,
  GetProductDetail,
  GetRecentOrders,
  GetLowStock,
  GetDashboard,
  GetNavCounts,
};
