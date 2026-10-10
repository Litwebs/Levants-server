"use strict";
jest.mock("../../utils/stripe.util", () => ({ paymentMethods: { retrieve: jest.fn() } }));
jest.mock("../../services/customerPortal/subscriptionPaymentMethod.service", () => ({ setCustomerDefaultCard: jest.fn() }));
const Customer = require("../../models/customer.model");
const Method = require("../../models/paymentMethod.model");
const stripe = require("../../utils/stripe.util");
const service = require("../../services/customerPortal/customerPayments.service");
afterEach(() => jest.restoreAllMocks());
test("a concurrent unique-key winner is recovered using the same owner and provider identity", async () => {
  jest.spyOn(Customer, "findById").mockReturnValue({ select: async () => ({ _id: "c", stripeCustomerId: "cus" }) });
  stripe.paymentMethods.retrieve.mockResolvedValue({ id: "pm", customer: "cus", type: "card" });
  jest.spyOn(Method, "findOneAndUpdate").mockReturnValue({ select: async () => { throw Object.assign(new Error("duplicate"), { code: 11000 }); } });
  jest.spyOn(Method, "findOne").mockReturnValue({ select: async () => ({ _id: "winner", isDefault: false }) });
  jest.spyOn(Method, "exists").mockResolvedValue(true);
  const result = await service.AttachPaymentMethod({ customerId: "c", stripePaymentMethodId: "pm", setDefault: false });
  expect(result.success).toBe(true);
  expect(result.data.paymentMethod._id).toBe("winner");
  expect(Method.findOne).toHaveBeenCalledWith({ customer: "c", provider: "stripe", providerReference: "pm" });
});
