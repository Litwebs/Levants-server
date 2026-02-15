const request = require("supertest");
const app = require("../../testApp");
const slugify = require("slugify");

const Product = require("../../../models/product.model");
const File = require("../../../models/file.model");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

async function createProductInDb({ userId, overrides = {} } = {}) {
  const thumb = await File.create({
    originalName: "thumb.jpg",
    filename: `test/thumb-${Date.now()}`,
    mimeType: "image/jpeg",
    sizeBytes: 1,
    url: "https://example.com/thumb.jpg",
    uploadedBy: userId,
  });

  const name = overrides.name || `Test Product ${Date.now()}`;

  return Product.create({
    name,
    slug: slugify(name, { lower: true, strict: true }),
    category: overrides.category || "Dairy",
    description: overrides.description || "Test",
    status: overrides.status || "active",
    thumbnailImage: thumb._id,
    galleryImages: [],
    allergens: [],
    storageNotes: null,
  });
}

describe("GET /api/admin/variants/products/:productId/variants (E2E)", () => {
  /**
   * =========================
   * AUTHENTICATION
   * =========================
   */

  test("401 when not authenticated", async () => {
    const res = await request(app).get(
      "/api/admin/variants/products/64f000000000000000000000/variants",
    );

    expect(res.status).toBe(401);
  });

  /**
   * =========================
   * AUTHORIZATION
   * =========================
   */

  test("403 without products.read permission", async () => {
    const driver = await createUser({ role: "driver" });

    const login = await request(app).post("/api/auth/login").send({
      email: driver.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/variants/products/64f000000000000000000000/variants")
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
      .get("/api/admin/variants/products/64f000000000000000000000/variants")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(404);
  });

  /**
   * =========================
   * SUCCESS PATH
   * =========================
   */

  test("200 admin can list variants for product", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const product = await createProductInDb({ userId: admin._id });
    const productId = String(product._id);

    // Create variants
    await request(app)
      .post(`/api/admin/variants/products/${productId}/variants`)
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "Small",
        sku: "TEST-S",
        price: 1.99,
        stockQuantity: 10,
        thumbnailImage: "/small.jpg",
      });

    await request(app)
      .post(`/api/admin/variants/products/${productId}/variants`)
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "Large",
        sku: "TEST-L",
        price: 3.99,
        stockQuantity: 5,
        thumbnailImage: "/large.jpg",
      });

    const res = await request(app)
      .get(`/api/admin/variants/products/${productId}/variants`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.variants)).toBe(true);
    expect(res.body.data.variants.length).toBe(2);
  });
});
