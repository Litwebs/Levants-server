"use strict";

jest.mock("../../utils/stripe.util", () => ({
  subscriptions: { update: jest.fn(), cancel: jest.fn() },
  paymentIntents: { create: jest.fn() }, refunds: { create: jest.fn() },
}));
jest.mock("../../services/customerPortal/subscriptionEmailNotifications.service", () => ({
  sendSubscriptionUpdateEmail: jest.fn(),
}));
jest.mock("../../services/subscriptionSettings.service", () => ({ getOrCreateSettings: jest.fn() }));
jest.mock("../../services/storeCredit.service", () => ({ addCredit: jest.fn() }));
jest.mock("../../services/customerPortal/subscriptionRefundSettlement.service", () => ({
  hasUnfinishedCardRefund: jest.fn(), refundAcrossSubscriptionPayments: jest.fn(),
}));
jest.mock("../../services/customerPortal/subscriptionDetachedAddOnSettlement.service", () => ({
  settleDetachedAddOns: jest.fn(),
}));
jest.mock("../../services/customerPortal/subscriptionResumePayment.service", () => ({
  prepareResumePayment: jest.fn(), recoverResumePayment: jest.fn(),
}));
jest.mock("../../services/subscriptions/subscriptionLifecycleLock.service", () => ({
  withSubscriptionLifecycleLock: jest.fn(async (_stripeId, execute) => execute()),
}));

const Subscription = require("../../models/subscription.model");
const Customer = require("../../models/customer.model");
const Delivery = require("../../models/subscriptionDelivery.model");
const clock = require("../../utils/subscriptionClock.util");
const settings = require("../../services/subscriptionSettings.service");
const stripe = require("../../utils/stripe.util");
const credit = require("../../services/storeCredit.service");
const refunds = require("../../services/customerPortal/subscriptionRefundSettlement.service");
const addOns = require("../../services/customerPortal/subscriptionDetachedAddOnSettlement.service");
const resumePayment = require("../../services/customerPortal/subscriptionResumePayment.service");
const service = require("../../services/customerPortal/customerSubscriptions.service");

let subscription;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(clock, "now").mockReturnValue(Date.parse("2026-10-09T10:00:00Z"));
  subscription = { _id: "s", customer: "c", status: "active", customerVersion: 3,
    isCancellationScheduled: true, cancellationEffectiveAfter: new Date("2026-10-11T08:00:00Z"),
    stripeSubscriptionId: "sub_already_cancelled", save: jest.fn() };
  jest.spyOn(Subscription, "findOne").mockImplementation(() => {
    const result = Promise.resolve(subscription);
    result.select = () => Promise.resolve(subscription);
    return result;
  });
  jest.spyOn(Customer, "findById");
  jest.spyOn(Delivery, "find");
  settings.getOrCreateSettings.mockRejectedValue(new Error("Cancellation must not read pause/resume settings"));
  resumePayment.recoverResumePayment.mockRejectedValue(new Error("Cancellation must not recover a resume charge"));
});
afterEach(() => jest.restoreAllMocks());

function expectNoFinancialWork() {
  expect(settings.getOrCreateSettings).not.toHaveBeenCalled();
  expect(Customer.findById).not.toHaveBeenCalled();
  expect(Delivery.find).not.toHaveBeenCalled();
  expect(credit.addCredit).not.toHaveBeenCalled();
  expect(refunds.hasUnfinishedCardRefund).not.toHaveBeenCalled();
  expect(refunds.refundAcrossSubscriptionPayments).not.toHaveBeenCalled();
  expect(addOns.settleDetachedAddOns).not.toHaveBeenCalled();
  expect(resumePayment.prepareResumePayment).not.toHaveBeenCalled();
  expect(resumePayment.recoverResumePayment).not.toHaveBeenCalled();
  expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  expect(stripe.refunds.create).not.toHaveBeenCalled();
  expect(subscription.save).not.toHaveBeenCalled();
}

test.each(["refund", "credit"])("scheduled cancellation rejects a %s pause before any settlement", async refundMethod => {
  const before = { ...subscription };
  const result = await service.PauseSubscription({ customerId: "c", subscriptionId: "s",
    resumeOn: "2026-10-16", refundMethod });
  expect(result).toEqual({ success: false, message: "Subscription is already scheduled for cancellation" });
  expect(subscription).toEqual(before);
  expect(Subscription.findOne).toHaveBeenCalledWith({ _id: "s", customer: "c" });
  expectNoFinancialWork();
});

test.each([null, { id: "saved-resume-plan", completedAt: null }])(
  "legacy paused cancellation rejects manual resume without charging or replaying a saved plan: %j", async plan => {
    subscription.status = "paused";
    subscription.resumePaymentPlan = plan;
    const result = await service.ResumeSubscription({ customerId: "c", subscriptionId: "s", operationId: "resume" });
    expect(result).toEqual({ success: false, message: "Subscription is already scheduled for cancellation" });
    expect(subscription.status).toBe("paused");
    expect(subscription.resumePaymentPlan).toBe(plan);
    expectNoFinancialWork();
  },
);

test("a due automatic resume still leaves a scheduled cancellation alone", async () => {
  subscription.status = "paused";
  subscription.pausedUntil = new Date("2026-10-08T23:00:00Z");
  jest.spyOn(Subscription, "find").mockResolvedValue([subscription]);
  expect(await service.AutoResumePausedSubscriptions({ subscriptionId: "s" })).toBe(0);
  expect(subscription.status).toBe("paused");
  expectNoFinancialWork();
});
