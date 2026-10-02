const request = require("supertest");
const app = require("../testApp");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("GET /api/admin/analytics/subscription-trends", () => {
  test("401 unauthenticated and 403 without analytics.read", async () => {
    expect((await request(app).get("/api/admin/analytics/subscription-trends?range=today&interval=day")).status).toBe(401);
    const driver = await createUser({ role: "driver" });
    const login = await request(app).post("/api/auth/login").send({
      email: driver.email,
      password: "secret123",
    });
    const res = await request(app)
      .get("/api/admin/analytics/subscription-trends?range=today&interval=day")
      .set("Cookie", getSetCookieHeader(login));
    expect(res.status).toBe(403);
  });

  test("200 returns stable zero-filled shape and ignores orderSource", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });
    const res = await request(app)
      .get("/api/admin/analytics/subscription-trends?range=custom&from=2026-06-10&to=2026-06-12&interval=day&orderSource=website")
      .set("Cookie", getSetCookieHeader(login));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({
      interval: "day",
      points: [
        expect.objectContaining({ label: "2026-06-10", newSubscriptions: 0, cancelledSubscriptions: 0, netRevenue: 0 }),
        expect.objectContaining({ label: "2026-06-11", newSubscriptions: 0, cancelledSubscriptions: 0, netRevenue: 0 }),
        expect.objectContaining({ label: "2026-06-12", newSubscriptions: 0, cancelledSubscriptions: 0, netRevenue: 0 }),
      ],
      totals: expect.objectContaining({ newSubscriptions: 0, cancelledSubscriptions: 0, netRevenue: 0 }),
    }));
  });

  test("rejects unbounded daily series", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });
    const res = await request(app)
      .get("/api/admin/analytics/subscription-trends?range=all&interval=day")
      .set("Cookie", getSetCookieHeader(login));
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("monthly or yearly");
  });
});
