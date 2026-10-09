"use strict";
const Subscription = require("../../models/subscription.model");
const Mutation = require("../../models/subscriptionMutation.model");
const { executeSubscriptionConcurrencyGuard: guard } = require("../../services/customerPortal/subscriptionMutation.service");
let execute;
beforeEach(() => {
  const state = { customerVersion: 1 };
  jest.spyOn(Subscription, "findOne").mockReturnValue({ select: () => ({ lean: async () => state }) });
  jest.spyOn(Subscription, "findOneAndUpdate").mockReturnValue({ lean: async () => state });
  jest.spyOn(Subscription, "updateOne").mockResolvedValue({});
  execute = jest.fn(async () => ({ success: true }));
});
afterEach(() => jest.restoreAllMocks());
const run = record => {
  jest.spyOn(Mutation, "find").mockReturnValue({ select: () => ({ lean: async () => record ? [record] : [] }) });
  return guard({ customerId: "c", subscriptionId: "s", operationId: "new-operation", execute });
};
it.each([
  ["unknown", {}],
  ["processing", { paymentIntent: { status: "processing", amount_received: 0 } }],
  ["paid", { paymentIntent: { status: "succeeded", amount_received: 500 } }],
  ["unverified decline", { paymentIntent: { status: "requires_payment_method" } }],
  ["nonzero receipt", { paymentIntent: { status: "requires_payment_method", amount_received: 500 } }],
])("blocks a new mutation for a %s add-on outcome", async (_label, addOnSnapshot) => {
  const result = await run({ addOnSnapshot });
  expect(result.success).toBe(false);
  expect(result.data.subscriptionBusy).toBe(true);
  expect(execute).not.toHaveBeenCalled();
  expect(Subscription.updateOne).toHaveBeenCalled();
});
it("allows a new mutation after a confirmed unpaid decline", async () => {
  expect((await run({ addOnSnapshot: { paymentIntent: { status: "requires_payment_method", amount_received: 0 } } })).success).toBe(true);
  expect(execute).toHaveBeenCalledTimes(1);
});
it("continues blocking unfinished recurring increases", async () => {
  expect((await run({ itemIncreaseSnapshot: { amountMinor: 500 } })).success).toBe(false);
  expect(execute).not.toHaveBeenCalled();
});
it("allows operations without pending payments and scopes out the original retry", async () => {
  expect((await run(null)).success).toBe(true);
  expect(Mutation.find).toHaveBeenCalledWith(expect.objectContaining({ customer: "c", subscription: "s",
    $or: expect.arrayContaining([expect.objectContaining({ status: { $ne: "completed" }, operationId: { $ne: "new-operation" } })]) }));
});
it("blocks conflicts while a completed purchase is being refunded", async () => {
  expect((await run({ status: "completed", addOnSnapshot: { settlement: { operationId: "original-removal" } } })).success).toBe(false);
  expect(execute).not.toHaveBeenCalled();
});
it("lets the original removal finish its saved settlement", async () => {
  expect((await run({ status: "completed", addOnSnapshot: { settlement: { operationId: "new-operation" } } })).success).toBe(true);
});
