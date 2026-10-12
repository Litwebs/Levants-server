"use strict";
const schemas = require("../../validators/portal.validators");
const objectId = "0123456789abcdef01234567";
const item = { variantId: objectId, quantity: 1 };
const create = { frequency: "weekly", preferredDeliveryDay: 3, deliveryAddressId: objectId, items: [item] };
describe("server-first rollout request contracts from client main 9f74c118", () => {
  test("old creation is rejected before any financial work; new creation requires a UUID", () => {
    const old = schemas.createSubscriptionSchema.validate(create);
    expect(old.error.details.map(detail => detail.path)).toContainEqual(["operationId"]);
    expect(schemas.createSubscriptionSchema.validate({
      ...create, operationId: "8ec674f6-fce7-46e8-b8b2-5d8af3f9424f",
    }).error).toBeUndefined();
  });
  test.each([
    ["notes update", "updateSubscriptionSchema", { notes: "Delivery note" }],
    ["pause", "pauseSubscriptionSchema", { resumeOn: "2026-11-04" }],
    ["resume", "resumeSubscriptionSchema", {}],
    ["cancel", "cancelSubscriptionSchema", { refundMethod: "refund" }],
    ["add item", "subscriptionItemSchema", item],
    ["change quantity", "updateSubscriptionItemSchema", { quantity: 2 }],
  ])("accepts the old %s shape without operationId or expectedVersion", (_, name, payload) => {
    expect(schemas[name].validate(payload).error).toBeUndefined();
  });
  test("the old delivery add-on already supplies the required operation UUID", () => {
    expect(schemas.nextDeliveryAddOnSchema.validate({
      operationId: "8ec674f6-fce7-46e8-b8b2-5d8af3f9424f", items: [item],
    }).error).toBeUndefined();
  });
});
