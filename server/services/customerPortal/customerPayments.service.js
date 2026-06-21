"use strict";

const Payment = require("../../models/payment.model");
const PaymentMethod = require("../../models/paymentMethod.model");
const { Response } = require("../../utils/response.util");

// ===== Customer-facing =====

async function ListPayments({ customerId, page = 1, pageSize = 20 } = {}) {
  const filter = { customer: customerId };
  const total = await Payment.countDocuments(filter);
  const payments = await Payment.find(filter)
    .populate("order", "orderId status total")
    .populate("subscription", "subscriptionNumber")
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  return Response(true, null, { payments, meta: { page, pageSize, total } });
}

async function ListPaymentMethods({ customerId } = {}) {
  const methods = await PaymentMethod.find({ customer: customerId }).lean();
  return Response(true, null, { paymentMethods: methods });
}

async function SetDefaultPaymentMethod({ customerId, paymentMethodId } = {}) {
  const method = await PaymentMethod.findOne({
    _id: paymentMethodId,
    customer: customerId,
  });
  if (!method) return Response(false, "Payment method not found", null);

  await PaymentMethod.updateMany(
    { customer: customerId, isDefault: true },
    { $set: { isDefault: false } },
  );
  method.isDefault = true;
  await method.save();

  return Response(true, "Default payment method updated", {
    paymentMethod: method,
  });
}

async function DeletePaymentMethod({ customerId, paymentMethodId } = {}) {
  const method = await PaymentMethod.findOne({
    _id: paymentMethodId,
    customer: customerId,
  });
  if (!method) return Response(false, "Payment method not found", null);
  await method.deleteOne();
  return Response(true, "Payment method removed", null);
}

// ===== Admin-facing =====

async function AdminListPayments({
  customerId,
  status,
  page = 1,
  pageSize = 20,
} = {}) {
  const filter = {};
  if (customerId) filter.customer = customerId;
  if (status) filter.status = status;

  const total = await Payment.countDocuments(filter);
  const payments = await Payment.find(filter)
    .populate("customer", "firstName lastName email")
    .populate("order", "orderId status total")
    .populate("subscription", "subscriptionNumber")
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  return Response(true, null, { payments, meta: { page, pageSize, total } });
}

async function AdminGetPayment({ paymentId } = {}) {
  const payment = await Payment.findById(paymentId)
    .populate("customer", "firstName lastName email phone")
    .populate("order", "orderId status total items")
    .populate("subscription", "subscriptionNumber status frequency")
    .lean();

  if (!payment) return Response(false, "Payment not found", null);
  return Response(true, null, { payment });
}

async function AdminUpdatePaymentStatus({
  paymentId,
  status,
  notes,
  updatedBy,
} = {}) {
  const payment = await Payment.findById(paymentId);
  if (!payment) return Response(false, "Payment not found", null);

  const validTransitions = {
    pending: ["paid", "failed"],
    failed: ["paid", "pending"],
    paid: ["refunded"],
    refunded: [],
  };

  const allowed = validTransitions[payment.status] || [];
  if (!allowed.includes(status)) {
    return Response(
      false,
      `Cannot transition payment from "${payment.status}" to "${status}"`,
      null,
    );
  }

  payment.status = status;
  if (notes) payment.notes = notes;
  if (updatedBy) payment.updatedBy = updatedBy;

  if (status === "paid") payment.paidAt = new Date();
  if (status === "failed") payment.failedAt = new Date();
  if (status === "refunded") payment.refundedAt = new Date();

  await payment.save();
  return Response(true, "Payment updated", { payment });
}

module.exports = {
  ListPayments,
  ListPaymentMethods,
  SetDefaultPaymentMethod,
  DeletePaymentMethod,
  AdminListPayments,
  AdminGetPayment,
  AdminUpdatePaymentStatus,
};
