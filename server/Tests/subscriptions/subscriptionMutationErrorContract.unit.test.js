"use strict";
jest.mock("../../services/customerPortal/customerSubscriptions.service", () => ({}));
jest.mock("../../services/subscriptions/subscriptionPriceReconciliation.service", () => ({}));
jest.mock("../../services/customerPortal/subscriptionMutation.service", () => ({ executeIdempotentSubscriptionMutation: jest.fn() }));
const { executeIdempotentSubscriptionMutation: mutate } = require("../../services/customerPortal/subscriptionMutation.service");
const { UpdateSubscription } = require("../../controllers/portal/customerSubscriptions.controller");
test.each([
  { subscriptionBusy: true, retryable: true, currentVersion: 4 },
  { staleSubscription: true, currentVersion: 5 },
  { idempotencyInProgress: true, retryable: true },
])("preserves the structured conflict response: %j", async data => {
  const response = { success: false, message: "Retry after refreshing", data };
  mutate.mockResolvedValueOnce(response);
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await UpdateSubscription({ customer: { _id: "c" }, params: { subscriptionId: "s" },
    body: { operationId: "explicit-operation" } }, res);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith(response);
});
