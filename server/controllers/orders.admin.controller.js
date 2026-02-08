const service = require("../services/orders.admin.service");
const refundService = require("../services/orders.refund.service");
const { sendOk, sendErr } = require("../utils/response.util");

const ListOrders = async (req, res) => {
  const result = await service.ListOrders({
    filters: req.query,
    page: Number(req.query.page || 1),
    pageSize: Number(req.query.pageSize || 20),
  });

  return sendOk(res, result.data);
};

const GetOrderById = async (req, res) => {
  const result = await service.GetOrderById({
    orderId: req.params.orderId,
  });

  if (!result.success) {
    return sendErr(res, { statusCode: 404, message: result.message });
  }

  return sendOk(res, result.data);
};

const UpdateOrderStatus = async (req, res) => {
  const result = await service.UpdateOrderStatus({
    orderId: req.params.orderId,
    status: req.body.status,
  });

  if (!result.success) {
    return sendErr(res, { statusCode: 404, message: result.message });
  }

  return sendOk(res, result.data);
};

const RefundOrder = async (req, res) => {
  const { orderId } = req.params;
  const { reason, restock } = req.body;

  const result = await refundService.RefundOrder({
    orderId,
    adminUserId: req.user.id,
    reason,
    restock,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message,
    });
  }

  return sendOk(res, result.data, {
    message: "Order refunded successfully",
  });
};

module.exports = {
  ListOrders,
  GetOrderById,
  UpdateOrderStatus,
  RefundOrder,
};
