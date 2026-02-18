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

  const name = overrides.name || `Delete Product ${Date.now()}`;

  const product = await Product.create({
    name,
    slug: slugify(name, { lower: true, strict: true }),
    category: overrides.category || "Dairy",
    description: overrides.description || "To be archived",
    status: overrides.status || "active",
    thumbnailImage: thumb._id,
    galleryImages: [],
    allergens: [],
    storageNotes: null,
  });

  return product;
}

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

    const product = await createProductInDb({ userId: admin._id });
    const productId = product._id.toString();

    // Delete
    const res = await request(app)
      .delete(`/api/admin/products/${productId}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.product.status).toBe("archived");
  });

  test("409 when product has variants", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const product = await createProductInDb({
      userId: admin._id,
      overrides: { name: "Product With Variants" },
    });

    // Create a variant for this product
    await request(app)
      .post(`/api/admin/variants/products/${product._id}/variants`)
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "Variant A",
        sku: `DEL-VAR-${Date.now()}`,
        price: 2.99,
        stockQuantity: 20,
        thumbnailImage: "/variant-a.jpg",
      });

    const res = await request(app)
      .delete(`/api/admin/products/${product._id}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test("200 when product variants are archived", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const product = await createProductInDb({
      userId: admin._id,
      overrides: { name: "Product With Archived Variants" },
    });

    // Create a variant
    const createdVariant = await request(app)
      .post(`/api/admin/variants/products/${product._id}/variants`)
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "Variant A",
        sku: `ARCH-VAR-${Date.now()}`,
        price: 2.99,
        stockQuantity: 20,
        thumbnailImage: "/variant-a.jpg",
      });

    const variantId = createdVariant.body.data.variant._id;

    // Archive variant
    const delVariant = await request(app)
      .delete(`/api/admin/variants/variants/${variantId}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(delVariant.status).toBe(200);

    // Now archive product should succeed
    const res = await request(app)
      .delete(`/api/admin/products/${product._id}`)
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

    const product = await createProductInDb({
      userId: admin._id,
      overrides: {
        name: "Hidden Product",
        category: "Dairy",
        description: "Hidden",
        status: "active",
      },
    });

    const productId = product._id.toString();

    await request(app)
      .delete(`/api/admin/products/${productId}`)
      .set("Cookie", getSetCookieHeader(login));

    const publicRes = await request(app).get("/api/products");

    const found = publicRes.body.data?.items?.find((p) => p.id === productId);

    expect(found).toBeUndefined();
  });
});
