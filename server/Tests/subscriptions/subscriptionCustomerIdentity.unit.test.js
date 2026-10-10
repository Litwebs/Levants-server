"use strict";
jest.mock("../../utils/stripe.util", () => ({ customers: { create: jest.fn(), list: jest.fn() } }));
jest.mock("../../utils/subscriptionLease.util", () => ({ ...jest.requireActual("../../utils/subscriptionLease.util"), withLease: async (_lease, execute) => execute() }));
const Customer = require("../../models/customer.model");
const stripe = require("../../utils/stripe.util");
const { ensureCustomerIdentity } = require("../../services/customerPortal/subscriptionCustomerIdentity.service");
let customer, held;
beforeEach(() => {
  jest.clearAllMocks();
  held = false;
  customer = { _id: "c", email: "test@example.com", firstName: "Test", stripeCustomerId: null };
  jest.spyOn(Customer, "findById").mockImplementation(() => ({ select: async () => ({ ...customer }) }));
  jest.spyOn(Customer, "findOneAndUpdate").mockImplementation(() => ({ select: async () => {
    if (held) return null;
    held = true;
    return { ...customer };
  } }));
  jest.spyOn(Customer, "updateOne").mockImplementation(async (_filter, update) => {
    Object.assign(customer, update.$set);
    if (update.$set.paymentMethodLock === null) held = false;
    return { matchedCount: 1 };
  });
  stripe.customers.create.mockResolvedValue({ id: "cus_original" });
});
afterEach(() => jest.restoreAllMocks());
test("competing initial requests create one identity; a busy caller can retry", async () => {
  const results = await Promise.allSettled([ensureCustomerIdentity("c"), ensureCustomerIdentity("c")]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find(result => result.status === "rejected").reason.code).toBe("SUBSCRIPTION_LIFECYCLE_BUSY");
  expect((await ensureCustomerIdentity("c")).stripeCustomerId).toBe("cus_original");
  expect(stripe.customers.create).toHaveBeenCalledTimes(1);
});
test("response loss retains the original provider parameters and key", async () => {
  stripe.customers.create.mockRejectedValueOnce(new Error("response lost"));
  await expect(ensureCustomerIdentity("c")).rejects.toThrow("response lost");
  expect(customer.stripeCustomerCreation).toBeTruthy();
  customer.email = "changed@example.com";
  await ensureCustomerIdentity("c");
  expect(stripe.customers.create.mock.calls[1]).toEqual(stripe.customers.create.mock.calls[0]);
  expect(customer.stripeCustomerCreation).toBeNull();
});
test("aged unknown creation cannot create another identity", async () => {
  customer.stripeCustomerCreation = { id: "op", startedAt: new Date(0).toISOString() };
  stripe.customers.list.mockResolvedValue({ data: [], has_more: false });
  await expect(ensureCustomerIdentity("c")).rejects.toThrow("another Stripe customer will not be created");
  expect(stripe.customers.create).not.toHaveBeenCalled();
});
test("aged recovery finds the original customer beyond the first page", async () => {
  customer.stripeCustomerCreation = { id: "op", startedAt: new Date(0).toISOString() };
  stripe.customers.list.mockResolvedValueOnce({ data: [{ id: "other", metadata: {} }], has_more: true })
    .mockResolvedValueOnce({ data: [{ id: "cus_original", metadata: { customerId: "c", profileOperationId: "op" } }], has_more: false });
  expect((await ensureCustomerIdentity("c")).stripeCustomerId).toBe("cus_original");
  expect(stripe.customers.create).not.toHaveBeenCalled();
});
