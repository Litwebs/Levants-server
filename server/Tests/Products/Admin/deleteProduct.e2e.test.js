const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("DELETE /api/admin/products/:productId (E2E)", () => {
  /**
   * =========================
   * AUTHENTICATION
   * =========================
   */

  test("401 when not authenticated", async () => {
    const res = await request(app).delete(
      "/api/admin/products/64f000000000000000000000",
    );

    expect(res.status).toBe(401);
  });

  /**
   * =========================
   * AUTHORIZATION
   * =========================
   */

  test("403 when lacking products.update permission", async () => {
    const staff = await createUser({ role: "staff" });

    const login = await request(app).post("/api/auth/login").send({
      email: staff.email,
      password: "secret123",
    });

    const res = await request(app)
      .delete("/api/admin/products/64f000000000000000000000")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
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
      .delete("/api/admin/products/64f000000000000000000000")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(404);
  });

  /**
   * =========================
   * SUCCESS PATH
   * =========================
   */

  test("200 admin can archive product", async () => {
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
        name: "Delete Product",
        category: "Dairy",
        description: "To be archived",
        thumbnailImage: "/thumb.jpg",
      });

    const productId = productRes.body.data.product._id;

    // Delete
    const res = await request(app)
      .delete(`/api/admin/products/${productId}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.product.status).toBe("archived");
  });

  /**
   * =========================
   * BUSINESS RULE
   * =========================
   */

  test("archived product does not appear in public listing", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const productRes = await request(app)
      .post("/api/admin/products")
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "Hidden Product",
        category: "Dairy",
        description: "Hidden",
        thumbnailImage: "/thumb.jpg",
        status: "active",
      });

    const productId = productRes.body.data.product._id;

    await request(app)
      .delete(`/api/admin/products/${productId}`)
      .set("Cookie", getSetCookieHeader(login));

    const publicRes = await request(app).get("/api/products");

    const found = publicRes.body.data?.items?.find((p) => p.id === productId);

    expect(found).toBeUndefined();
  });
});
