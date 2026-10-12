"use strict";
jest.mock("../../utils/stripe.util", () => ({}));
jest.mock("../../services/customerPortal/subscriptionEmailNotifications.service", () => ({}));
const Subscription = require("../../models/subscription.model");
const Delivery = require("../../models/subscriptionDelivery.model");
const settings = require("../../services/subscriptionSettings.service");
const clock = require("../../utils/subscriptionClock.util");
const { GetSubscription } = require("../../services/customerPortal/customerSubscriptions.service");
const { formatDateKeyInTimeZone } = require("../../utils/subscriptionCutoff.util");
const date = value => new Date(`${value}T09:00:00Z`);
const key = value => formatDateKeyInTimeZone(value, "Europe/London");
let slots;
const query = value => ({ sort() { return this; }, lean: async () => value });
beforeEach(() => {
  jest.spyOn(clock, "now").mockReturnValue(Date.parse("2026-10-10T21:00:00Z"));
  jest.spyOn(settings, "getOrCreateSettings").mockResolvedValue({ deliveryDays: [0, 3], cutoffDaysBefore: 2, cutoffTime: "22:00" });
  jest.spyOn(Subscription, "find").mockResolvedValue([]);
  jest.spyOn(Subscription, "findOne").mockReturnValue(query({ _id: "subscription", customer: "customer", status: "active",
    frequency: "weekly", preferredDeliveryDay: 0, preferredDeliveryDays: [0, 3], nextDeliveryDate: date("2026-10-21"), items: [] }));
  slots = [{ scheduledDate: date("2026-10-14"), status: "generated" }, { scheduledDate: date("2026-10-18"), status: "generated" }];
  jest.spyOn(Delivery, "findOne").mockImplementation(() => query(slots[0]));
  jest.spyOn(Delivery, "find").mockImplementation(() => query(slots));
});
afterEach(() => jest.restoreAllMocks());
test("uses the paid Sunday delivery rather than a skipped calendar Sunday", async () => {
  const result = await GetSubscription({ customerId: "customer", subscriptionId: "subscription" });
  const sunday = result.data.cutoff.deliveryDayCutoffs.find(day => day.day === 0);
  expect(key(sunday.deliveryDate)).toBe("2026-10-18");
  expect(key(sunday.cutoffAt)).toBe("2026-10-16");
  expect(sunday.isPastCutoff).toBe(false);
  expect(key(sunday.effectiveFrom)).toBe("2026-10-25");
  const wednesday = result.data.cutoff.deliveryDayCutoffs.find(day => day.day === 3);
  expect(key(wednesday.deliveryDate)).toBe("2026-10-14");
  expect(key(wednesday.cutoffAt)).toBe("2026-10-12");
  expect(wednesday.isPastCutoff).toBe(false);
});
test("protects an actual closed-cutoff slot instead of jumping to a later open one", async () => {
  slots.unshift({ scheduledDate: date("2026-10-11"), status: "generated" });
  const result = await GetSubscription({ customerId: "customer", subscriptionId: "subscription" });
  const sunday = result.data.cutoff.deliveryDayCutoffs.find(day => day.day === 0);
  expect(key(sunday.deliveryDate)).toBe("2026-10-11");
  expect(sunday.isPastCutoff).toBe(true);
});
test("retains conservative calendar cutoff behaviour when legacy slots are absent", async () => {
  slots.length = 0;
  const result = await GetSubscription({ customerId: "customer", subscriptionId: "subscription" });
  const sunday = result.data.cutoff.deliveryDayCutoffs.find(day => day.day === 0);
  expect(key(sunday.deliveryDate)).toBe("2026-10-11");
  expect(sunday.isPastCutoff).toBe(true);
});
