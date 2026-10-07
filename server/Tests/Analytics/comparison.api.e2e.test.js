const request = require("supertest");
const app = require("../testApp");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("GET /api/admin/analytics/comparison", () => {
  test("401 when not authenticated", async () => {
    const res = await request(app).get(
      "/api/admin/analytics/comparison?range=last7",
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
      .get("/api/admin/analytics/comparison?range=last7")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  test("200 returns current, previous and changes for an admin", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(
        "/api/admin/analytics/comparison?range=custom&from=2026-06-10&to=2026-06-12",
      )
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(
      expect.objectContaining({
        available: true,
        strategy: "previous_period",
        currentPeriod: expect.objectContaining({
          from: "2026-06-10",
          to: "2026-06-12",
          days: 3,
        }),
        previousPeriod: expect.objectContaining({
          from: "2026-06-07",
          to: "2026-06-09",
          days: 3,
        }),
        current: expect.objectContaining({
          grossRevenue: 0,
          netRevenue: 0,
          totalOrders: 0,
          unitsSold: 0,
        }),
        previous: expect.objectContaining({
          grossRevenue: 0,
          netRevenue: 0,
          totalOrders: 0,
          unitsSold: 0,
        }),
        changes: expect.objectContaining({
          netRevenue: expect.objectContaining({
            percentChange: 0,
            direction: "flat",
          }),
        }),
      }),
    );
  });

  test("all-time reports comparison as unavailable instead of fabricating a percentage", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/analytics/comparison?range=all")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.objectContaining({
        available: false,
        reason: "unbounded_range",
        changes: null,
      }),
    );
  });
});
