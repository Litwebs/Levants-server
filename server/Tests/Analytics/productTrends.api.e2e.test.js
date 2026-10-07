const request = require("supertest");
const app = require("../testApp");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("GET /api/admin/analytics/product-trends", () => {
  test("401 when unauthenticated", async () => {
    const res = await request(app).get(
      "/api/admin/analytics/product-trends?range=today&interval=day",
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
      .get("/api/admin/analytics/product-trends?range=today&interval=day")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  test("200 returns stable empty product trend shape", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(
        "/api/admin/analytics/product-trends?range=custom&from=2026-06-10&to=2026-06-12&interval=day&limit=3",
      )
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(
      expect.objectContaining({
        interval: "day",
        period: expect.objectContaining({
          from: "2026-06-10",
          to: "2026-06-12",
        }),
        products: [],
        metricBasis: expect.objectContaining({
          ranking: expect.any(String),
          revenue: expect.any(String),
          units: expect.any(String),
        }),
      }),
    );
  });

  test("rejects excessive daily ranges before aggregation", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(
        "/api/admin/analytics/product-trends?from=2020-01-01&to=2026-01-01&interval=day",
      )
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("maximum is 1000");
  });

  test("rejects excessive limits and unbounded fine-grained intervals", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });
    const cookie = getSetCookieHeader(login);

    const excessiveLimit = await request(app)
      .get("/api/admin/analytics/product-trends?range=today&interval=day&limit=11")
      .set("Cookie", cookie);
    expect(excessiveLimit.status).toBe(400);
    expect(excessiveLimit.body.message).toContain("between 1 and 10");

    const allTimeDaily = await request(app)
      .get("/api/admin/analytics/product-trends?range=all&interval=day")
      .set("Cookie", cookie);
    expect(allTimeDaily.status).toBe(400);
    expect(allTimeDaily.body.message).toContain("monthly or yearly");
  });
});
