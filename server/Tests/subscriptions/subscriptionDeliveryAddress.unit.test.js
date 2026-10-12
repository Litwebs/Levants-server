"use strict";
jest.mock("../../Integration/google.geocode", () => ({ geocodeAddress: jest.fn() }));
const { geocodeAddress } = require("../../Integration/google.geocode");
const { locateDeliveryAddress, canChangeOrderAddress } = require("../../services/customerPortal/subscriptionDeliveryAddress.service");
const now = new Date("2026-08-10T12:00:00Z").getTime();
const settings = { cutoffDaysBefore: 2, cutoffTime: "22:00" };
const base = { status: "paid", deliveryStatus: "ordered", deliveryDate: new Date("2026-08-16T09:00:00Z") };
it("allows a paid order with its own cut-off still open", () => {
  expect(canChangeOrderAddress(base, settings, new Date(now), now)).toBe(true);
});
it("keeps a credit-reduced but still paid delivery eligible", () => {
  expect(canChangeOrderAddress({ ...base, status: "partially_refunded" }, settings, new Date(now), now)).toBe(true);
});
it.each([
  { deliveryStatus: "dispatched" }, { deliveryStatus: "in_transit" },
  { deliveryStatus: "delivered" }, { status: "refunded" },
  { deliveryDate: null }, { deliveryDate: new Date("2026-08-09") },
  { deliveryDate: new Date("2026-08-11T09:00:00Z") },
])("preserves ineligible fulfillment: %j", change => {
  expect(canChangeOrderAddress({ ...base, ...change }, settings, new Date(now), now)).toBe(false);
});
it("respects a staged address's effective date", () => {
  expect(canChangeOrderAddress(base, settings, new Date("2026-08-20"), now)).toBe(false);
});
it("locks changes at the exact cut-off", () => {
  const cutoff = new Date("2026-08-14T21:00:00Z").getTime();
  expect(canChangeOrderAddress(base, settings, new Date(now), cutoff)).toBe(false);
});
it.each([{}, { lat: NaN, lng: 0 }, { lat: 91, lng: 0 }, { lat: 1, lng: 181 }])("rejects unusable geocoding: %j", async value => {
  geocodeAddress.mockResolvedValueOnce(value);
  await expect(locateDeliveryAddress({})).rejects.toThrow("Invalid address coordinates");
});
it("keeps valid coordinates with the new address", async () => {
  geocodeAddress.mockResolvedValueOnce({ lat: 52.1, lng: -0.3 });
  await expect(locateDeliveryAddress({ line1: "New address" })).resolves.toEqual({ lat: 52.1, lng: -0.3 });
});

it("allows a same-day delivery until that day's configured cut-off", () => {
  expect(canChangeOrderAddress({ ...base, deliveryDate: new Date("2026-08-10T09:00:00Z") },
    { cutoffDaysBefore: 0, cutoffTime: "22:00" }, new Date(now), now)).toBe(true);
});
