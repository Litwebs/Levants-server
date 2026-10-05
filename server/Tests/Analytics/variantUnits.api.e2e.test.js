const request = require("supertest");
const app = require("../testApp");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("GET /api/admin/analytics/variant-units", () => {
  test("401 when unauthenticated", async () => {
    const res = await request(app).get(
      "/api/admin/analytics/variant-units?range=today",
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
      .get("/api/admin/analytics/variant-units?range=today")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  test("200 returns stable empty variant-units shape", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(
        "/api/admin/analytics/variant-units?range=custom&from=2026-06-10&to=2026-06-12&limit=5",
      )
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(
      expect.objectContaining({
        variants: [],
        byUnits: [],
        byRevenue: [],
        bySalesMix: [],
        totals: {
          totalRevenue: 0,
          totalUnits: 0,
          variantsSold: 0,
          oneTime: { revenue: 0, units: 0 },
          subscription: { revenue: 0, units: 0 },
          importedExcluded: { revenue: 0, units: 0 },
        },
        metricBasis: expect.objectContaining({
          revenue: expect.any(String),
          units: expect.any(String),
          ranking: expect.any(String),
          identity: expect.any(String),
        }),
      }),
    );
  });

  test("rejects a limit above the endpoint cap", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/analytics/variant-units?range=today&limit=26")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("between 1 and 25");
  });
});
