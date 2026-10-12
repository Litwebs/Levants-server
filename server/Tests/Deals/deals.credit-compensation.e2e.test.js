jest.mock("../../services/orders/orders.stock.service", () => {
  const actual = jest.requireActual("../../services/orders/orders.stock.service");
  return { ...actual, finalizeStockForOrder: jest.fn(actual.finalizeStockForOrder) };
});
const request = require("supertest");
const app = require("../testApp");
const Customer = require("../../models/customer.model");
const Variant = require("../../models/variant.model");
const Order = require("../../models/order.model");
const { finalizeStockForOrder } = require("../../services/orders/orders.stock.service");
const jwt = require("../../utils/jwt.util");
const { createCustomer } = require("../Orders/helpers/orderFactory");
const { createPackage } = require("./helpers/dealFactory");

test("failed fully-credit-paid package settlement restores credit and releases every component", async () => {
  const fixture = await createPackage();
  const customer = await createCustomer();
  customer.isGuest = false; customer.status = "active"; customer.creditBalance = 2000; await customer.save();
  finalizeStockForOrder.mockRejectedValueOnce(new Error("Settlement unavailable"));
  const response = await request(app).post("/api/portal/orders/checkout").set("Authorization", `Bearer ${jwt.signCustomerAccessToken(customer)}`).send({
    items: fixture.contents, deals: [fixture.claim], creditToApplyMinor: 1250,
    deliveryAddress: { line1: "1 Test Street", city: "Bradford", postcode: "BD1 1AA", country: "GB" },
  });
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect((await Customer.findById(customer.id)).creditBalance).toBe(2000);
  for (const variant of [fixture.milkVariant, fixture.eggsVariant]) expect((await Variant.findById(variant.id)).reservedQuantity).toBe(0);
  const order = await Order.findOne({ customer: customer.id });
  expect(order.status).toBe("failed");
  expect(order.metadata.deals[0].packagePrice).toBe(11.5);
});
