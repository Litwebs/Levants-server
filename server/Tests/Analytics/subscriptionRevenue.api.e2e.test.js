const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../testApp");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("GET /api/admin/analytics/subscription-revenue", () => {
  test("401 when unauthenticated", async () => {
    const res = await request(app).get(
      "/api/admin/analytics/subscription-revenue?range=today",
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
      .get("/api/admin/analytics/subscription-revenue?range=today")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  test("200 remains scoped to Subscription even when another orderSource is supplied", async () => {
    const customer = await createCustomer();
    const product = await createProduct({ name: "Subscription Revenue API Product" });
    const variant = await createVariant({ product, price: 10, stock: 100 });

    await createOrder({
      customer,
      status: "paid",
      items: [{
        product: product._id,
        variant: variant._id,
        name: variant.name,
        sku: variant.sku,
        price: 10,
        quantity: 2,
        subtotal: 20,
      }],
      overrides: {
        subtotal: 20,
        total: 20,
        paidAt: new Date("2026-06-10T12:00:00.000Z"),
        orderType: "subscription_generated",
        subscription: new mongoose.Types.ObjectId(),
      },
    });

    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(
        "/api/admin/analytics/subscription-revenue?range=custom&from=2026-06-10&to=2026-06-10&orderSource=website",
      )
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(
      expect.objectContaining({
        subscriptionRevenue: 20,
        grossRevenue: 20,
        refundAmount: 0,
        totalOrders: 1,
        unitsSold: 2,
      }),
    );
    expect(res.body.data.metricBasis.source).toContain("Subscription channel");
  });

  test("rejects invalid custom dates", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(
        "/api/admin/analytics/subscription-revenue?range=custom&from=2026-02-30&to=2026-03-01",
      )
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(400);
  });
});
