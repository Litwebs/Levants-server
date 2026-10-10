"use strict";
jest.mock("../../Integration/google.geocode", () => ({ geocodeAddress: jest.fn() }));
jest.mock("../../utils/subscriptionCutoff.util", () => ({ computeSubscriptionCutoffDate: () => new Date(Date.now() + 86400000) }));
const Order = require("../../models/order.model");
const Customer = require("../../models/customer.model");
const Notification = require("../../models/customerNotification.model");
const settings = require("../../services/subscriptionSettings.service");
const { geocodeAddress } = require("../../Integration/google.geocode");
const service = require("../../services/customerPortal/customerOrders.service");
afterEach(() => jest.restoreAllMocks());

test("dispatch while geocoding prevents changing the delivery address", async () => {
  const persisted = { deliveryStatus: "ordered", deliveryAddress: { line1: "Old address" } };
  const order = { _id: "o", orderId: "O1", subscription: "s", customer: "c", status: "paid",
    deliveryStatus: "ordered", deliveryDate: new Date(Date.now() + 172800000),
    deliveryAddress: persisted.deliveryAddress, location: { lat: 1, lng: 2 },
    save: jest.fn(async function () { persisted.deliveryAddress = this.deliveryAddress; }),
  };
  const query = { then: resolve => resolve(order), populate() { return this; }, lean: async () => ({ ...order, ...persisted }) };
  jest.spyOn(Order, "findOne").mockReturnValue(query);
  jest.spyOn(Order, "updateOne").mockImplementation(async (filter, update) => {
    if (filter.deliveryStatus !== persisted.deliveryStatus) return { matchedCount: 0 };
    persisted.deliveryAddress = update.$set.deliveryAddress;
    return { matchedCount: 1 };
  });
  jest.spyOn(Customer, "findById").mockResolvedValue({ addresses: { id: () => ({ line1: "New address", city: "London", postcode: "N1", country: "GB" }) } });
  jest.spyOn(settings, "getOrCreateSettings").mockResolvedValue({});
  jest.spyOn(Notification, "create").mockResolvedValue({});
  geocodeAddress.mockImplementation(async () => {
    persisted.deliveryStatus = "dispatched";
    return { lat: 3, lng: 4 };
  });
  const result = await service.UpdateOrderDelivery({ customerId: "c", orderId: "o", deliveryAddressId: "a" });
  expect(persisted.deliveryStatus).toBe("dispatched");
  expect(result.success).toBe(false);
  expect(persisted.deliveryAddress.line1).toBe("Old address");
});
