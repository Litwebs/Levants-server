const request = require("supertest");
const app = require("../testApp");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("GET /api/admin/analytics/sales-breakdown", () => {
  test("401 when unauthenticated", async () => {
    const res = await request(app).get(
      "/api/admin/analytics/sales-breakdown?range=today",
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
      .get("/api/admin/analytics/sales-breakdown?range=today")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  test("200 returns stable channel rows for an admin", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(
        "/api/admin/analytics/sales-breakdown?range=custom&from=2026-06-10&to=2026-06-12",
      )
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.channels.map((channel) => channel.key)).toEqual([
      "website",
      "subscription",
      "imported",
    ]);
    expect(res.body.data.totals).toEqual(
      expect.objectContaining({
        grossRevenue: 0,
        refundAmount: 0,
        netRevenue: 0,
        totalOrders: 0,
        unitsSold: 0,
      }),
    );
  });
});
