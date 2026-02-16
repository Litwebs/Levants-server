const service = require("../services/orders.admin.service");
const refundService = require("../services/orders.refund.service");
const { sendOk, sendErr } = require("../utils/response.util");

const ListOrders = async (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);

  const rawSortBy =
    typeof req.query.sortBy === "string" ? req.query.sortBy : undefined;
  const rawSortOrder =
    typeof req.query.sortOrder === "string" ? req.query.sortOrder : undefined;

  // Avoid allowing arbitrary sort field injection.
  const allowedSortBy = new Set([
    "createdAt",
    "updatedAt",
    "total",
    "subtotal",
    "paidAt",
    "expiresAt",
    "orderId",
    "status",
  ]);

  const sortBy =
    rawSortBy && allowedSortBy.has(rawSortBy) ? rawSortBy : undefined;
  const sortOrder =
    rawSortOrder === "asc"
      ? "asc"
      : rawSortOrder === "desc"
        ? "desc"
        : undefined;

  // Keep filters separate from paging/sorting params.
  const filters = { ...req.query };
  delete filters.page;
  delete filters.pageSize;
  delete filters.sortBy;
  delete filters.sortOrder;

  const result = await service.ListOrders({
    filters,
    page,
    pageSize,
    sortBy: sortBy || "createdAt",
    sortOrder: sortOrder || "desc",
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
    deliveryStatus: req.body.deliveryStatus,
  });

  if (!result.success) {
    return sendErr(res, { statusCode: 404, message: result.message });
  }

  return sendOk(res, result.data);
};

const RefundOrder = async (req, res) => {
  const { orderId } = req.params;
  const { reason, restock } = req.body || {};

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

const BulkUpdateDeliveryStatus = async (req, res) => {
  const { orderIds, deliveryStatus } = req.body || {};

  const result = await service.BulkUpdateDeliveryStatus({
    orderIds,
    deliveryStatus,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Bulk update failed",
    });
  }

  return sendOk(res, result.data, {
    message: "Delivery statuses updated successfully",
  });
};

async function bulkAssignDeliveryDate(req, res) {
  try {
    const { orderIds, deliveryDate } = req.body;

    const result = await service.bulkAssignDeliveryDate({
      orderIds,
      deliveryDate,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to assign delivery date",
    });
  }
}

module.exports = {
  ListOrders,
  GetOrderById,
  UpdateOrderStatus,
  RefundOrder,
  BulkUpdateDeliveryStatus,
  bulkAssignDeliveryDate,
};
