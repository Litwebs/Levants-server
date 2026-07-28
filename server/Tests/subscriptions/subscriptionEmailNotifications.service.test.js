"use strict";

jest.mock("../../models/customer.model", () => ({
  init: jest.fn().mockResolvedValue(undefined),
  findById: jest.fn(),
}));
jest.mock("../../Integration/Email.service", () => jest.fn());

const sendEmail = require("../../Integration/Email.service");
const {
  sendSubscriptionUpdateEmail,
} = require("../../services/customerPortal/subscriptionEmailNotifications.service");

const subscription = {
  _id: "507f1f77bcf86cd799439011",
  subscriptionNumber: "SUB-1001",
};

describe("subscription email notifications", () => {
  beforeEach(() => jest.clearAllMocks());

  test("sends a rendered subscription update when the preference is enabled", async () => {
    sendEmail.mockResolvedValue({ success: true, response: { id: "email-1" } });

    const result = await sendSubscriptionUpdateEmail({
      customer: {
        firstName: "Sarah",
        lastName: "Miller",
        email: "sarah@example.com",
        notificationPreferences: { subscriptionUpdates: true },
      },
      subscription,
      title: "Subscription paused",
      message: "Your subscription has been paused until 01 Aug 2026.",
    });

    expect(result).toEqual({ sent: true });
    expect(sendEmail).toHaveBeenCalledWith(
      "sarah@example.com",
      "Subscription paused",
      "subscriptionUpdate",
      expect.objectContaining({
        customerName: "Sarah Miller",
        subscriptionNumber: "SUB-1001",
        title: "Subscription paused",
      }),
    );
  });

  test("does not send when subscription update emails are disabled", async () => {
    const result = await sendSubscriptionUpdateEmail({
      customer: {
        email: "sarah@example.com",
        notificationPreferences: { subscriptionUpdates: false },
      },
      subscription,
      title: "Subscription updated",
    });

    expect(result).toEqual({ sent: false, reason: "preference_disabled" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("contains provider failures so a completed subscription action is not rolled back", async () => {
    sendEmail.mockResolvedValue({
      success: false,
      error: new Error("provider unavailable"),
    });

    await expect(
      sendSubscriptionUpdateEmail({
        customer: { email: "sarah@example.com" },
        subscription,
        title: "Subscription updated",
      }),
    ).resolves.toEqual({ sent: false, reason: "provider_failure" });
  });
});
