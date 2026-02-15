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

  const name = overrides.name || `Product ${Date.now()}`;

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

describe("GET /api/admin/products (E2E)", () => {
  test("401 unauthenticated", async () => {
    const res = await request(app).get("/api/admin/products");
    expect(res.status).toBe(401);
  });

  test("200 admin lists products", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/products")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.products)).toBe(true);
  });

  test("does not return archived products", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const active = await createProductInDb({
      userId: admin._id,
      overrides: { name: "Active Product", status: "active" },
    });
    const archived = await createProductInDb({
      userId: admin._id,
      overrides: { name: "Archived Product", status: "archived" },
    });

    const res = await request(app)
      .get("/api/admin/products")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);

    const ids = (res.body.data.products || []).map((p) => String(p._id));
    expect(ids).toContain(String(active._id));
    expect(ids).not.toContain(String(archived._id));
  });
});
