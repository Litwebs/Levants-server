"use strict";
jest.mock("../../services/customerPortal/customerSubscriptions.service", () => ({
  RecoverSubscriptionItemIncrease: jest.fn(async () => null), AddNextDeliveryAddOn: jest.fn(async () => ({ success: true, data: {} })),
}));
jest.mock("../../services/customerPortal/subscriptionMutation.service", () => ({
  executeIdempotentSubscriptionMutation: jest.fn(async args => args.execute({ resourceId: "s" })),
}));
const Mutation = require("../../models/subscriptionMutation.model");
const service = require("../../services/customerPortal/customerSubscriptions.service");
const journal = require("../../services/customerPortal/subscriptionMutation.service");
const { recoverSavedOperation: recover } = require("../../services/subscriptions/subscriptionOperationRecovery.service");
let mutation;
beforeEach(() => {
  jest.clearAllMocks();
  mutation = { status: "failed", subscription: "s", operationId: "op", mutationType: "add_next_delivery_add_on",
    requestPayload: { items: [{ variantId: "original", quantity: 2 }] } };
  jest.spyOn(Mutation, "findOne").mockImplementation(() => ({ select: () => ({ lean: async () => mutation }) }));
});
afterEach(() => jest.restoreAllMocks());
test("operator repair retains the customer, original payload and original operation identity", async () => {
  await recover("c", "op");
  expect(journal.executeIdempotentSubscriptionMutation).toHaveBeenCalledWith(expect.objectContaining({
    customerId: "c", subscriptionId: "s", operationId: "op", payload: mutation.requestPayload,
  }));
  expect(service.AddNextDeliveryAddOn).toHaveBeenCalledWith(expect.objectContaining({
    customerId: "c", subscriptionId: "s", operationId: "op", items: mutation.requestPayload.items,
  }));
});
test("a completed repair returns its saved response without executing another payment", async () => {
  mutation.status = "completed";
  mutation.response = { success: true, data: { paymentOutcome: "refunded" } };
  expect(await recover("c", "op")).toBe(mutation.response);
  expect(journal.executeIdempotentSubscriptionMutation).not.toHaveBeenCalled();
});
test("a legacy operation with no saved request cannot be guessed", async () => {
  mutation.requestPayload = null;
  await expect(recover("c", "op")).rejects.toThrow("cannot be reconstructed safely");
  expect(journal.executeIdempotentSubscriptionMutation).not.toHaveBeenCalled();
});
test("an operation cannot be recovered under the wrong customer", async () => {
  mutation = null;
  await expect(recover("foreign", "op")).rejects.toThrow("does not exist for this customer");
  expect(Mutation.findOne).toHaveBeenCalledWith({ customer: "foreign", operationId: "op" });
});
