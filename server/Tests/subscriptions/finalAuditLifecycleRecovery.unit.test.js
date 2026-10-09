"use strict";
const sift = require("sift").default;
const Subscription = require("../../models/subscription.model");
const Mutation = require("../../models/subscriptionMutation.model");
const Invoice = require("../../models/subscriptionInvoiceFulfillment.model");
const { withSubscriptionLifecycleLock: run } = require("../../services/subscriptions/subscriptionLifecycleLock.service");
let mutation;
beforeEach(() => {
  mutation = { subscription: "s", status: "failed", itemIncreaseSnapshot: { paymentIntent: { id: "pi", status: "succeeded" } } };
  jest.spyOn(Subscription, "findOneAndUpdate").mockReturnValue({ select: async () => ({ _id: "s" }) });
  jest.spyOn(Subscription, "updateOne").mockResolvedValue({ matchedCount: 1 });
  jest.spyOn(Invoice, "exists").mockResolvedValue(false);
  jest.spyOn(Mutation, "exists").mockImplementation(async filter => sift(filter)(mutation));
});
afterEach(() => jest.restoreAllMocks());

test.each([
  ["failed", "succeeded"], ["processing", "succeeded"],
  ["failed", "processing"], ["failed", null],
])("lifecycle handlers defer an unfinished %s item increase with payment %s", async (status, paymentStatus) => {
  mutation.status = status;
  mutation.itemIncreaseSnapshot.paymentIntent = paymentStatus ? { id: "pi", status: paymentStatus } : null;
  const execute = jest.fn();
  await expect(run("stripe", execute, { allowInvoiceRecovery: true })).rejects
    .toMatchObject({ statusCode: 503, code: "SUBSCRIPTION_LIFECYCLE_BUSY" });
  expect(execute).not.toHaveBeenCalled();
  expect(Subscription.updateOne).toHaveBeenCalledTimes(1);
});

test("scheduler paths cannot change the baseline while paid item recovery is unfinished", async () => {
  const execute = jest.fn();
  await expect(run(null, execute, { subscriptionId: "s" })).rejects
    .toMatchObject({ code: "SUBSCRIPTION_LIFECYCLE_BUSY" });
  expect(execute).not.toHaveBeenCalled();
});

test.each(["completed", "empty", "other-subscription"])("lifecycle work remains available for %s purchase records", async state => {
  if (state === "completed") mutation.status = "completed";
  if (state === "empty") mutation.itemIncreaseSnapshot = null;
  if (state === "other-subscription") mutation.subscription = "other";
  const execute = jest.fn(async () => "done");
  expect(await run("stripe", execute)).toBe("done");
  expect(execute).toHaveBeenCalledTimes(1);
});
