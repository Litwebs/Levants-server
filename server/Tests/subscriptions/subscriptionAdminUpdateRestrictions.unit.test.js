"use strict";

jest.mock("../../services/customerPortal/customerSubscriptions.service", () => ({
  UpdateSubscription: jest.fn(),
}));
jest.mock("../../services/customerPortal/subscriptionMutation.service", () => ({
  executeSubscriptionConcurrencyGuard: jest.fn(),
}));
jest.mock("../../services/customers.service", () => ({}));

const Subscription = require("../../models/subscription.model");
const customerService = require("../../services/customerPortal/customerSubscriptions.service");
const { executeSubscriptionConcurrencyGuard } = require("../../services/customerPortal/subscriptionMutation.service");
const { AdminUpdateSubscription } = require("../../services/customerPortal/adminSubscriptions.service");
const controller = require("../../controllers/portal/adminSubscriptions.controller");

const subscriptionId = "64f000000000000000000001";
const customerId = "64f000000000000000000002";
const variantId = "64f000000000000000000003";
const plan = [{ day: 0, items: [{ variantId, quantity: 1 }] }];
const deniedMessage = "Subscription products cannot be changed by admins";

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Subscription, "findById").mockResolvedValue({
    _id: subscriptionId,
    customer: customerId,
  });
  executeSubscriptionConcurrencyGuard.mockImplementation(({ execute }) => execute());
  customerService.UpdateSubscription.mockResolvedValue({ success: true, data: { updated: true } });
});
afterEach(() => jest.restoreAllMocks());

test.each([
  ["day-specific products", { deliveryDayPlans: plan }],
  ["products combined with allowed settings", { deliveryDayPlans: plan, notes: "Leave at side door" }],
  ["explicit clearing of day plans", { deliveryDayPlans: null }],
  ["explicit undefined day plans", { deliveryDayPlans: undefined }],
  ["aggregate products from an internal caller", { items: [{ variantId, quantity: 2 }] }],
])("admin update rejects %s before any lookup or mutation", async (_label, fields) => {
  const result = await AdminUpdateSubscription({ subscriptionId, expectedVersion: 2, ...fields });
  expect(result).toMatchObject({ success: false, statusCode: 403, message: deniedMessage });
  expect(Subscription.findById).not.toHaveBeenCalled();
  expect(executeSubscriptionConcurrencyGuard).not.toHaveBeenCalled();
  expect(customerService.UpdateSubscription).not.toHaveBeenCalled();
});

test.each([
  { notes: "Leave at side door" },
  { frequency: "weekly", preferredDeliveryDays: [0, 3], deliveryAddressId: variantId },
])("permitted admin settings retain ownership and concurrency checks: %j", async fields => {
  const result = await AdminUpdateSubscription({ subscriptionId, expectedVersion: 2, ...fields });
  expect(result.success).toBe(true);
  expect(executeSubscriptionConcurrencyGuard).toHaveBeenCalledWith(expect.objectContaining({
    customerId, subscriptionId, expectedVersion: 2, operationId: expect.stringMatching(/^admin:/),
  }));
  expect(customerService.UpdateSubscription).toHaveBeenCalledWith({ customerId, subscriptionId, ...fields });
});

test("the general admin PATCH controller preserves the product-denial HTTP status", async () => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.UpdateSubscription({ params: { subscriptionId }, body: { deliveryDayPlans: plan } }, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json).toHaveBeenCalledWith({ success: false, message: deniedMessage, data: null });
  expect(customerService.UpdateSubscription).not.toHaveBeenCalled();
});

test.each([{ staleSubscription: true }, { subscriptionBusy: true }])(
  "allowed admin updates still return 409 on concurrency conflicts: %j", async data => {
    executeSubscriptionConcurrencyGuard.mockResolvedValueOnce({ success: false, message: "Refresh and retry", data });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await controller.UpdateSubscription({ params: { subscriptionId }, body: { notes: "New note", expectedVersion: 2 } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(customerService.UpdateSubscription).not.toHaveBeenCalled();
  },
);
