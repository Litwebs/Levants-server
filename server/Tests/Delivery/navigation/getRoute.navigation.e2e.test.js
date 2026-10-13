const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../testApp");
const DeliveryBatch = require("../../../models/deliveryBatch.model");
const Route = require("../../../models/route.model");
const Stop = require("../../../models/stop.model");
const Order = require("../../../models/order.model");
const { loginAsAdmin, loginAs } = require("../../helpers/loginAs");
const { createUser } = require("../../helpers/authTestData");
const { createCustomer, createProduct, createVariant, createOrder } = require("../../Orders/helpers/orderFactory");
const { generateNavigationLinks } = require("../../../utils/navigation.util");

async function fixture() {
  const driver = await createUser({ role: "driver", name: "Navigation Driver" });
  const customer = await createCustomer();
  const product = await createProduct();
  const variant = await createVariant({ product });
  const order = await createOrder({ customer, items: [{ product: product._id,
    variant: variant._id, name: variant.name, sku: variant.sku,
    price: variant.price, quantity: 1, subtotal: variant.price }] });
  const batch = await DeliveryBatch.create({ deliveryDate: new Date(), orders: [order._id] });
  const route = await Route.create({ batch: batch._id, driver: driver._id });
  const stop = await Stop.create({ route: route._id, order: order._id, sequence: 1 });
  return { driver, order, route, stop };
}

describe("GET delivery route navigation (E2E)", () => {
  test("includes all providers and the legacy link in the authenticated route response", async () => {
    const cookie = await loginAsAdmin(app);
    const { route, order, stop } = await fixture();
    const res = await request(app).get(`/api/admin/delivery/route/${route._id}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.stops[0]._id).toBe(String(stop._id));
    expect(res.body.data.stops[0].navigationLinks).toEqual(generateNavigationLinks(order.location, order.deliveryAddress));
    expect(res.body.data.stops[0].navigationUrl).toContain("maps/search/");
    expect(await Stop.findById(stop._id).lean()).not.toHaveProperty("navigationLinks");
  });
  test("uses the full delivery address for historical orders without coordinates", async () => {
    const cookie = await loginAsAdmin(app);
    const { route, order } = await fixture();
    await Order.collection.updateOne({ _id: order._id }, { $unset: { location: "" } });
    const res = await request(app).get(`/api/admin/delivery/route/${route._id}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.stops[0].navigationLinks).toEqual(generateNavigationLinks(null, order.deliveryAddress));
    expect(res.body.data.stops[0].navigationUrl).toBeNull();
  });
  test("does not invent a destination for missing order references", async () => {
    const cookie = await loginAsAdmin(app);
    const { route, order } = await fixture();
    await Order.deleteOne({ _id: order._id });
    const res = await request(app).get(`/api/admin/delivery/route/${route._id}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.stops[0].navigationLinks).toBeNull();
  });
  test("allows the assigned driver and conceals another driver's route", async () => {
    const { driver, route } = await fixture();
    const cookie = await loginAs(app, driver);
    const allowed = await request(app).get(`/api/admin/delivery/route/${route._id}`).set("Cookie", cookie);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.stops[0].navigationLinks).toHaveProperty("waze");
    const other = await createUser({ role: "driver", name: "Other Driver" });
    const otherCookie = await loginAs(app, other);
    const denied = await request(app).get(`/api/admin/delivery/route/${route._id}`).set("Cookie", otherCookie);
    expect(denied.status).toBe(404);
    expect(denied.body.data).toBeUndefined();
  });
  test("rejects unauthenticated access", async () => {
    const { route } = await fixture();
    const res = await request(app).get(`/api/admin/delivery/route/${route._id}`);
    expect(res.status).toBe(401);
  });
  test("returns 404 for unknown routes", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`/api/admin/delivery/route/${new mongoose.Types.ObjectId()}`).set("Cookie", cookie);
    expect(res.status).toBe(404);
  });
});
