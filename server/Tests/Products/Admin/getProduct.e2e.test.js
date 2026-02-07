const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("GET /api/admin/products/:productId (E2E)", () => {
  /**
   * =========================
   * AUTHENTICATION
   * =========================
   */

  test("401 when not authenticated", async () => {
    const res = await request(app).get(
      "/api/admin/products/64f000000000000000000000",
    );

    expect(res.status).toBe(401);
  });

  /**
   * =========================
   * AUTHORIZATION
   * =========================
   */

  test("403 when lacking products.read permission", async () => {
    const driver = await createUser({ role: "driver" });

    const login = await request(app).post("/api/auth/login").send({
      email: driver.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/products/64f000000000000000000000")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  /**
   * =========================
   * VALIDATION
   * =========================
   */

  test("400 when productId is invalid", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/products/not-a-valid-id")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(400);
  });

  /**
   * =========================
   * RESOURCE EXISTENCE
   * =========================
   */

  test("404 when product does not exist", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/products/64f000000000000000000000")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(404);
  });

  /**
   * =========================
   * SUCCESS PATH
   * =========================
   */

  test("200 admin can fetch product with variants", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    // Create product
    const productRes = await request(app)
      .post("/api/admin/products")
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "Admin Product",
        category: "Dairy",
        description: "Test product",
        thumbnailImage: "/thumb.jpg",
      });

    const productId = productRes.body.data.product._id;

    // Create variant
    await request(app)
      .post(`/api/admin/variants/products/${productId}/variants`)
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "Variant A",
        sku: "GET-VAR-1",
        price: 2.99,
        stockQuantity: 20,
        thumbnailImage: "/variant-a.jpg",
      });

    const res = await request(app)
      .get(`/api/admin/products/${productId}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.product._id).toBe(productId);
    expect(Array.isArray(res.body.data.variants)).toBe(true);
    expect(res.body.data.variants.length).toBe(1);
  });
});
