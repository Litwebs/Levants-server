const request = require("supertest");
const app = require("../testApp");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");
const {
  createProduct,
  createVariant,
} = require("../Orders/helpers/orderFactory");

describe("GET /api/admin/analytics/variants/:variantId", () => {
  test("401 when unauthenticated", async () => {
    const res = await request(app).get(
      "/api/admin/analytics/variants/507f1f77bcf86cd799439011?range=today&interval=day",
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
      .get(
        "/api/admin/analytics/variants/507f1f77bcf86cd799439011?range=today&interval=day",
      )
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  test("200 returns stable empty detail for a current variant", async () => {
    const product = await createProduct({ name: "API Variant Product" });
    const variant = await createVariant({ product, price: 12, stock: 100 });
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(
        `/api/admin/analytics/variants/${variant._id}?range=custom&from=2026-06-10&to=2026-06-12&interval=day`,
      )
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(
      expect.objectContaining({
        variantId: String(variant._id),
        productId: String(product._id),
        variantName: variant.name,
        currentPrice: 12,
        totalRevenue: 0,
        totalUnits: 0,
        totalOrders: 0,
        priceDifference: null,
        sourceSplit: expect.any(Array),
        trend: expect.objectContaining({
          interval: "day",
          points: expect.any(Array),
        }),
      }),
    );
  });

  test("rejects invalid ids and oversized time series before detail work", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });
    const cookie = getSetCookieHeader(login);

    const invalid = await request(app)
      .get("/api/admin/analytics/variants/not-an-id?range=today&interval=day")
      .set("Cookie", cookie);
    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toContain("Invalid variant id");

    const excessive = await request(app)
      .get(
        "/api/admin/analytics/variants/507f1f77bcf86cd799439011?from=2020-01-01&to=2026-01-01&interval=day",
      )
      .set("Cookie", cookie);
    expect(excessive.status).toBe(400);
    expect(excessive.body.message).toContain("maximum is 1000");
  });
});
