const request = require("supertest");
const app = require("../testApp");
const Subscription = require("../../models/subscription.model");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");
const {
  createCustomer,
  createProduct,
  createVariant,
} = require("../Orders/helpers/orderFactory");

describe("GET /api/admin/analytics/cancelled-subscriptions", () => {
  test("401 when unauthenticated", async () => {
    const res = await request(app).get(
      "/api/admin/analytics/cancelled-subscriptions?range=today",
    );
    expect(res.status).toBe(401);
  });

  test("403 without analytics.read permission", async () => {
    const driver = await createUser({ role: "driver" });
    const login = await request(app).post("/api/auth/login").send({
      email: driver.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/analytics/cancelled-subscriptions?range=today")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  test("200 returns effective cancellations and ignores order-source filtering", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Cancelled API Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

    const subscription = await Subscription.create({
      customer: customer._id,
      status: "cancelled",
      cancelledAt: new Date("2026-06-10T12:00:00.000Z"),
      frequency: "weekly",
      preferredDeliveryDay: 2,
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      nextDeliveryDate: new Date("2026-06-17T00:00:00.000Z"),
      deliveryAddress: {
        line1: "1 Analytics Road",
        city: "London",
        postcode: "SW1A 1AA",
        country: "GB",
      },
      items: [{
        product: product._id,
        variant: variant._id,
        name: variant.name,
        sku: variant.sku,
        quantity: 1,
        unitPrice: 10,
      }],
    });
    await Subscription.collection.updateOne(
      { _id: subscription._id },
      {
        $set: {
          status: "cancelled",
          cancelledAt: new Date("2026-06-10T12:00:00.000Z"),
        },
      },
    );

    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(
        "/api/admin/analytics/cancelled-subscriptions?range=custom&from=2026-06-10&to=2026-06-10&orderSource=website",
      )
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      cancelledSubscriptions: 1,
      period: {
        from: "2026-06-10",
        to: "2026-06-10",
        timeZone: "Europe/London",
      },
      metricBasis: {
        cancelledSubscriptions: expect.any(String),
        source: expect.stringContaining("Order-source filters do not apply"),
      },
    });
  });

  test("rejects invalid custom dates", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(
        "/api/admin/analytics/cancelled-subscriptions?range=custom&from=2026-02-30&to=2026-03-01",
      )
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(400);
  });
});
