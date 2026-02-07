const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("DELETE /api/admin/variants/variants/:variantId (E2E)", () => {
  /**
   * =========================
   * AUTHENTICATION
   * =========================
   */

  test("401 when not authenticated", async () => {
    const res = await request(app).delete(
      "/api/admin/variants/variants/64f000000000000000000000",
    );

    expect(res.status).toBe(401);
  });

  /**
   * =========================
   * AUTHORIZATION
   * =========================
   */

  test("403 without products.update permission", async () => {
    const staff = await createUser({ role: "staff" });

    const login = await request(app).post("/api/auth/login").send({
      email: staff.email,
      password: "secret123",
    });

    const res = await request(app)
      .delete("/api/admin/variants/variants/64f000000000000000000000")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  /**
   * =========================
   * RESOURCE EXISTENCE
   * =========================
   */

  test("404 when variant does not exist", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .delete("/api/admin/variants/variants/64f000000000000000000000")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(404);
  });

  /**
   * =========================
   * SUCCESS PATH
   * =========================
   */

  test("200 admin can soft-delete variant", async () => {
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
        name: "Variant Product",
        category: "Dairy",
        description: "Test",
        thumbnailImage: "/test.jpg",
      });

    const productId = productRes.body.data.product._id;

    // Create variant
    const variantRes = await request(app)
      .post(`/api/admin/variants/products/${productId}/variants`)
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "Delete Me",
        sku: "DEL-1",
        price: 2.5,
        stockQuantity: 5,
        thumbnailImage: "/variant-a.jpg",
      });

    const variantId = variantRes.body.data.variant._id;

    // Delete
    const res = await request(app)
      .delete(`/api/admin/variants/variants/${variantId}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify it no longer appears in active list
    const listRes = await request(app)
      .get(`/api/admin/variants/products/${productId}/variants`)
      .set("Cookie", getSetCookieHeader(login));

    const activeVariants = listRes.body.data.variants.filter(
      (v) => v._id === variantId,
    );

    expect(activeVariants.length).toBe(0);
  });
});
