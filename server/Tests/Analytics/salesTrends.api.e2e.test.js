const request = require("supertest");
const app = require("../testApp");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("GET /api/admin/analytics/sales-trends", () => {
  test("401 when unauthenticated", async () => {
    const res = await request(app).get(
      "/api/admin/analytics/sales-trends?range=today&interval=day",
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
      .get("/api/admin/analytics/sales-trends?range=today&interval=day")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  test("200 returns aligned stable channel series", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(
        "/api/admin/analytics/sales-trends?range=custom&from=2026-06-10&to=2026-06-12&interval=day",
      )
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.interval).toBe("day");
    expect(res.body.data.channels.map((channel) => channel.key)).toEqual([
      "website",
      "subscription",
      "imported",
    ]);
    expect(
      res.body.data.channels.every((channel) => channel.points.length === 3),
    ).toBe(true);
  });

  test("inherits revenue-series bucket safety validation", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(
        "/api/admin/analytics/sales-trends?from=2020-01-01&to=2026-01-01&interval=day",
      )
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("maximum is 1000");
  });
});
