"use strict";
jest.mock("../../utils/stripe.util", () => ({ paymentIntents: { retrieve: jest.fn() } }));
const { summarizeOrderPayment } = require("../../services/customerPortal/paymentReporting.util");
const service = require("../../services/customerPortal/customerPayments.service");
const Order = require("../../models/order.model");
const Payment = require("../../models/payment.model");
const stripe = require("../../utils/stripe.util");
const refund = (amountMinor, status = "succeeded", stripeRefundId = "re_1") => ({ amountMinor, status, stripeRefundId });
const subscription = { orderType: "subscription_generated", status: "partially_refunded", total: 61, amountPaid: 61,
  paymentAllocations: [{ amountMinor: 6100 }, { amountMinor: 1200 }], refunds: [refund(1200)] };
afterEach(() => jest.restoreAllMocks());
test("73 collected minus 12 returned leaves 61, without subtracting twice", () => {
  expect(summarizeOrderPayment(subscription)).toEqual({ capturedAmount: 73, refundedAmount: 12, creditedAmount: 0, netAmount: 61, settledAmount: 12 });
});
test("ordinary orders keep amountPaid gross after admin refunds", () => {
  expect(summarizeOrderPayment({ status: "partially_refunded", amountPaid: 73, total: 73, refunds: [refund(1200)] }).netAmount).toBe(61);
});
test("legacy subscription without allocations reconstructs gross from net and successful refund", () => {
  expect(summarizeOrderPayment({ ...subscription, paymentAllocations: [] })).toEqual(summarizeOrderPayment(subscription));
});
test("pending and failed refunds do not reduce paid balance", () => {
  expect(summarizeOrderPayment({ ...subscription, amountPaid: 73, refunds: [refund(1200, "pending"), refund(1200, "failed")] }).netAmount).toBe(73);
});
test("minor units divide correctly and duplicate provider refunds count once", () => {
  const result = summarizeOrderPayment({ ...subscription, refunds: [refund(1200), refund(1200)] });
  expect(result.refundedAmount).toBe(12);
  expect(result.netAmount).toBe(61);
});
test("major-only legacy refund entries are supported", () => {
  expect(summarizeOrderPayment({ ...subscription, refunds: [{ amount: 12, status: "succeeded" }] }).refundedAmount).toBe(12);
});
test("partial store credit is separate from card refunds", () => {
  expect(summarizeOrderPayment({ ...subscription, refunds: [] })).toMatchObject({ capturedAmount: 73, refundedAmount: 0, creditedAmount: 12, netAmount: 61 });
});
test("fully settled subscriptions have zero net even if amountPaid was retained", () => {
  expect(summarizeOrderPayment({ ...subscription, status: "refunded", refunds: [refund(1200), refund(6100, "succeeded", "re_2")] })).toMatchObject({ capturedAmount: 73, refundedAmount: 73, netAmount: 0 });
});
test("full store credit is not mislabeled as a card refund", () => {
  expect(summarizeOrderPayment({ ...subscription, status: "refunded", refunds: [] })).toMatchObject({ creditedAmount: 73, refundedAmount: 0, netAmount: 0 });
});
test("legacy full card refund uses its confirmation without invented credit", () => {
  expect(summarizeOrderPayment({ total: 13, status: "refunded", refund: { stripeRefundId: "re_old", refundedAt: new Date() } })).toMatchObject({ capturedAmount: 13, refundedAmount: 13, creditedAmount: 0, netAmount: 0 });
});
test("zero-decimal currency minor entries are not divided by 100", () => {
  expect(summarizeOrderPayment({ currency: "JPY", total: 1000, refunds: [refund(200)] }).netAmount).toBe(800);
});
function chain(rows) {
  const query = {};
  for (const method of ["select", "populate", "sort", "skip", "limit"]) query[method] = jest.fn(() => query);
  query.lean = jest.fn().mockResolvedValue(rows);
  return query;
}
test("customer API preserves partial status and explicit settlement values even when Stripe lookup fails", async () => {
  const query = chain([{ ...subscription, _id: "o", stripePaymentIntentId: "pi", currency: "GBP" }]);
  jest.spyOn(Order, "countDocuments").mockResolvedValue(1);
  jest.spyOn(Order, "find").mockReturnValue(query);
  stripe.paymentIntents.retrieve.mockRejectedValue(new Error("temporarily unavailable"));
  const result = await service.ListPayments({ customerId: "c" });
  expect(result.data.payments[0]).toMatchObject({ status: "partially_refunded", amount: 61, capturedAmount: 73, refundedAmount: 12, netAmount: 61 });
  expect(query.select.mock.calls[0][0]).toContain("paymentAllocations");
  expect(Order.find).toHaveBeenCalledWith(expect.objectContaining({ customer: "c" }));
});
test("admin list corrects legacy refunded payment rows when their order is only partially refunded", async () => {
  jest.spyOn(Payment, "countDocuments").mockResolvedValue(1);
  jest.spyOn(Payment, "find").mockReturnValue(chain([{ _id: "p", status: "refunded", amount: 61, order: subscription }]));
  const result = await service.AdminListPayments({ customerId: "c" });
  expect(result.data.payments[0]).toMatchObject({ status: "partially_refunded", orderSettlement: { netAmount: 61, capturedAmount: 73 } });
});
test("admin detail uses the same partial-refund settlement as the list", async () => {
  jest.spyOn(Payment, "findById").mockReturnValue(chain({ status: "refunded", order: subscription }));
  const result = await service.AdminGetPayment({ paymentId: "p" });
  expect(result.data.payment).toMatchObject({ status: "partially_refunded", orderSettlement: { netAmount: 61 } });
});
