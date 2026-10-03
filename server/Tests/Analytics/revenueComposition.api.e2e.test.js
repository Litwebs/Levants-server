const request = require("supertest");
const app = require("../testApp");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("GET /api/admin/analytics/revenue-composition", () => {
  test("401 when unauthenticated", async () => {
    const res = await request(app).get(
      "/api/admin/analytics/revenue-composition?range=today",
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
      .get("/api/admin/analytics/revenue-composition?range=today")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  test("200 returns stable composition shape for an admin", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(
        "/api/admin/analytics/revenue-composition?range=custom&from=2026-06-10&to=2026-06-12&orderSource=website",
      )
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      merchandiseRevenue: 0,
      deliveryRevenue: 0,
      discountAmount: 0,
      discountedOrders: 0,
      averageDiscountPerDiscountedOrder: 0,
      discountRate: 0,
      preDiscountRevenue: 0,
      grossRevenue: 0,
      refundAmount: 0,
      netRevenue: 0,
    });
  });
});
