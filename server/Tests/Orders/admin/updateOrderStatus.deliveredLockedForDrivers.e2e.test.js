const request = require("supertest");

const app = require("../../testApp");

const Order = require("../../../models/order.model");
const Role = require("../../../models/role.model");

const { loginAsAdmin, loginAs } = require("../../helpers/loginAs");
const { createUser } = require("../../helpers/authTestData");
const {
  createCustomer,
  createProduct,
  createVariant,
} = require("../helpers/orderFactory");

describe("PUT /api/admin/orders/:orderId/status (Delivered lock for drivers)", () => {
  const getValidDeliveryAddress = () => ({
    line1: "10 Downing Street",
    line2: "",
    city: "London",
    postcode: "SW1A 2AA",
    country: "United Kingdom",
  });

  const getValidLocation = () => ({
    lat: 51.5033635,
    lng: -0.1276248,
  });

  test("blocks driver-like users from changing delivered orders", async () => {
    const adminCookie = await loginAsAdmin(app);

    // Create a driver-like role: can update orders, can read routes,
    // but cannot update routes (matches driver heuristic).
    const role = await Role.create({
      name: `driver_ro_${Date.now()}`,
      permissions: ["orders.read", "orders.update", "delivery.routes.read"],
      isSystem: false,
    });

    const driver = await createUser({
      role: role.name,
      status: "active",
      password: "secret123",
    });

    // Ensure the user actually uses this role doc.
    driver.role = role._id;
    await driver.save();

    const driverCookie = await loginAs(app, driver);

    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product });

    const order = await Order.create({
      customer: customer._id,
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: variant.price,
          quantity: 1,
          subtotal: variant.price,
        },
      ],
      subtotal: variant.price,
      deliveryAddress: getValidDeliveryAddress(),
      location: getValidLocation(),
      deliveryFee: 0,
      total: variant.price,
      status: "paid",
      deliveryStatus: "delivered",
      reservationExpiresAt: new Date(),
      paidAt: new Date(),
    });

    // Driver-like users should be blocked from changing delivered orders.
    const res = await request(app)
      .put(`/api/admin/orders/${order._id}/status`)
      .set("Cookie", driverCookie)
      .send({
        deliveryStatus: "ordered",
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(String(res.body.message || "")).toMatch(/locked/i);

    const fresh = await Order.findById(order._id);
    expect(fresh.deliveryStatus).toBe("delivered");

    // Admin can still change delivered orders (no restriction).
    const adminRes = await request(app)
      .put(`/api/admin/orders/${order._id}/status`)
      .set("Cookie", adminCookie)
      .send({
        deliveryStatus: "returned",
      });

    expect(adminRes.status).toBe(200);
  });
});
