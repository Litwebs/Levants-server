const request = require("supertest");
const app = require("../testApp");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("GET /api/admin/analytics/average-subscription-value", () => {
  test("401 when unauthenticated", async () => {
    const res = await request(app).get(
      "/api/admin/analytics/average-subscription-value",
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
      .get("/api/admin/analytics/average-subscription-value")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  test("200 returns a stable point-in-time value shape", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(
        "/api/admin/analytics/average-subscription-value?range=custom&from=2020-01-01&to=2020-01-02&orderSource=imported",
      )
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      averageSubscriptionValue: 0,
      averageMerchandiseValue: 0,
      averageDeliveryFeeValue: 0,
      totalRecurringCharge: 0,
      activeSubscriptions: 0,
      metricBasis: {
        averageSubscriptionValue: expect.any(String),
        scope: expect.stringContaining("historical date and order-source filters do not apply"),
      },
    });
  });
});
