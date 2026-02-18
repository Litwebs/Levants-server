const service = require("../services/analytics.admin.service");
const { sendOk, sendErr } = require("../utils/response.util");

const GetSummary = async (req, res) => {
  const result = await service.GetSummary({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
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
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
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
  GetRevenueSeries,
  GetRevenueOverview,
  GetOrderStatusCounts,
  GetTopProducts,
  GetRecentOrders,
  GetLowStock,
  GetDashboard,
};
