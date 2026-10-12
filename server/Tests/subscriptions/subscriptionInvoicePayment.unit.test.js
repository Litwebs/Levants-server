"use strict";
const Payment = require("../../models/payment.model");
const { saveInvoicePayment } = require("../../services/subscriptions/subscriptionInvoicePayment.service");
const entry = { order: "o", subscription: "s", amount: 11, status: "paid" };
afterEach(() => jest.restoreAllMocks());
it("uses the same atomic insert identity for concurrent attempts", async () => {
  jest.spyOn(Payment, "findOneAndUpdate").mockResolvedValue({ _id: "one" });
  await Promise.all([saveInvoicePayment("in", entry), saveInvoicePayment("in", entry)]);
  expect(Payment.findOneAndUpdate.mock.calls[0]).toEqual(Payment.findOneAndUpdate.mock.calls[1]);
  expect(Payment.findOneAndUpdate).toHaveBeenCalledWith({ subscriptionInvoiceKey: "s:in:o" },
    { $setOnInsert: { ...entry, subscriptionInvoiceKey: "s:in:o" } }, { upsert: true, new: true, runValidators: true });
});
it("returns the winning record after a duplicate-key race without overwriting its refunded status", async () => {
  jest.spyOn(Payment, "findOneAndUpdate").mockRejectedValue({ code: 11000 });
  jest.spyOn(Payment, "findOne").mockResolvedValue({ _id: "winner", status: "refunded" });
  expect(await saveInvoicePayment("in", entry)).toEqual({ _id: "winner", status: "refunded" });
});
it("does not swallow a duplicate-key error without the expected winner", async () => {
  const error = { code: 11000 };
  jest.spyOn(Payment, "findOneAndUpdate").mockRejectedValue(error);
  jest.spyOn(Payment, "findOne").mockResolvedValue(null);
  await expect(saveInvoicePayment("in", entry)).rejects.toBe(error);
});
it("propagates database failures for retry", async () => {
  jest.spyOn(Payment, "findOneAndUpdate").mockRejectedValue(new Error("offline"));
  await expect(saveInvoicePayment("in", entry)).rejects.toThrow("offline");
});
it("declares a unique index limited to invoice-identified payments", () => {
  expect(Payment.schema.indexes()).toEqual(expect.arrayContaining([
    [ { subscriptionInvoiceKey: 1 }, expect.objectContaining({ unique: true,
      partialFilterExpression: { subscriptionInvoiceKey: { $type: "string" } } }) ],
  ]));
});
