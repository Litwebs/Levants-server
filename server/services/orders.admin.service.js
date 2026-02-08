const Order = require("../models/order.model");

async function ListOrders({ filters, page = 1, pageSize = 20 }) {
  const query = {};

  if (filters?.status) query.status = filters.status;

  const total = await Order.countDocuments(query);

  const orders = await Order.find(query)
    .populate("customer")
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize);

  return {
    success: true,
    data: {
      orders,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    },
  };
}

async function GetOrderById({ orderId }) {
  const order = await Order.findById(orderId).populate("customer");

  if (!order) {
    return { success: false, message: "Order not found" };
  }

  return { success: true, data: { order } };
}

async function UpdateOrderStatus({ orderId, status }) {
  const order = await Order.findById(orderId);

  if (!order) {
    return { success: false, message: "Order not found" };
  }

  order.status = status;
  await order.save();

  return { success: true, data: { order } };
}

module.exports = {
  ListOrders,
  GetOrderById,
  UpdateOrderStatus,
};
