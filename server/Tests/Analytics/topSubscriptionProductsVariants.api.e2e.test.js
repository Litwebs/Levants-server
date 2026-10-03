const request = require("supertest");
const app = require("../testApp");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("GET /api/admin/analytics/top-subscription-products-variants", () => {
  test("401 when unauthenticated", async () => {
    const res = await request(app).get(
      "/api/admin/analytics/top-subscription-products-variants?range=today",
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
      .get("/api/admin/analytics/top-subscription-products-variants?range=today")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  test("200 returns stable empty product and variant ranking shapes", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(
        "/api/admin/analytics/top-subscription-products-variants?range=custom&from=2026-06-10&to=2026-06-12&limit=5&orderSource=website",
      )
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(
      expect.objectContaining({
        products: {
          byRevenue: [],
          byUnits: [],
          totals: { totalRevenue: 0, totalUnits: 0, productsSold: 0 },
        },
        variants: {
          byRevenue: [],
          byUnits: [],
          totals: { totalRevenue: 0, totalUnits: 0, variantsSold: 0 },
        },
        metricBasis: expect.objectContaining({
          source: expect.stringContaining("Imported/manual"),
        }),
      }),
    );
  });

  test("rejects limits above the endpoint cap", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(
        "/api/admin/analytics/top-subscription-products-variants?range=today&limit=26",
      )
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("between 1 and 25");
  });
});
