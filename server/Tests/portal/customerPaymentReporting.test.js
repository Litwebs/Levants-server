"use strict";
const mongoose = require("mongoose");
jest.mock("../../utils/stripe.util", () => ({ paymentIntents: { retrieve: jest.fn().mockResolvedValue({ status: "succeeded" }) } }));
const Order = require("../../models/order.model");
const Payment = require("../../models/payment.model");
const Credit = require("../../models/storeCreditTransaction.model");
const service = require("../../services/customerPortal/customerPayments.service");

test("persisted partial refunds return correct customer amounts and consistent admin filters/details", async () => {
  const id = () => new mongoose.Types.ObjectId();
  const customer = id();
  const order = await Order.create({ orderId: `ORD-REPORT-${id()}`, customer,
    orderType: "subscription_generated", status: "partially_refunded", subtotal: 60, deliveryFee: 1, total: 61, amountPaid: 61,
    paidAt: new Date(), stripePaymentIntentId: "pi_reporting", reservationExpiresAt: new Date(Date.now() + 60000),
    items: [{ product: id(), variant: id(), name: "Reporting test", sku: "report", price: 12, quantity: 5, subtotal: 60 }],
    deliveryAddress: { line1: "Test", city: "Test", postcode: "BD1 1AA", country: "UK" }, location: { lat: 53.8, lng: -1.75 },
    paymentAllocations: [{ paymentIntentId: "pi_reporting", source: "subscription_invoice", amountMinor: 6100 },
      { paymentIntentId: "pi_reporting_increase", source: "modification", amountMinor: 1200 }],
    refunds: [{ stripeRefundId: "re_reporting", paymentIntentId: "pi_reporting_increase", amountMinor: 1200, status: "succeeded", refundedAt: new Date() }],
  });
  // Reproduce an older misclassified ledger row without mutating its money.
  const payment = await Payment.create({ customer, order: order._id, amount: 61, status: "refunded" });
  const listed = await service.ListPayments({ customerId: customer });
  expect(listed.data.payments).toHaveLength(1);
  expect(listed.data.payments[0]).toMatchObject({ status: "partially_refunded", amount: 61, capturedAmount: 73, refundedAmount: 12, netAmount: 61 });
  expect((await service.ListPayments({ customerId: id() })).data.payments).toEqual([]);
  const partial = await service.AdminListPayments({ customerId: customer, status: "partially_refunded" });
  expect(partial.data.meta.total).toBe(1);
  expect(partial.data.payments[0]).toMatchObject({ status: "partially_refunded", orderSettlement: { capturedAmount: 73, netAmount: 61 } });
  expect((await service.AdminListPayments({ customerId: customer, status: "refunded" })).data.meta.total).toBe(0);
  const detail = await service.AdminGetPayment({ paymentId: payment._id });
  expect(detail.data.payment.status).toBe("partially_refunded");
  expect((await Payment.findById(payment._id)).amount).toBe(61);
  await Order.updateOne({ _id: order._id }, { $set: { status: "refunded", paymentAllocations: [] } });
  await Credit.create({ customer, order: order._id, type: "subscription_refund", amount: 6100, balanceAfter: 6100 });
  const legacy = await service.ListPayments({ customerId: customer });
  expect(legacy.data.payments[0]).toMatchObject({ status: "refunded", capturedAmount: 73, refundedAmount: 12, creditedAmount: 61, netAmount: 0 });
});
