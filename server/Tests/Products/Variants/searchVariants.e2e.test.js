const request = require("supertest");
const app = require("../../testApp");
const slugify = require("slugify");

const Product = require("../../../models/product.model");
const Variant = require("../../../models/variant.model");
const File = require("../../../models/file.model");

const mongoose = require("mongoose");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

async function createFile({ uploadedBy } = {}) {
  return File.create({
    originalName: "img.jpg",
    filename: `test/img-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    mimeType: "image/jpeg",
    sizeBytes: 1,
    url: "https://example.com/img.jpg",
    uploadedBy: uploadedBy || new mongoose.Types.ObjectId(),
  });
}

async function createProduct({ userId, name } = {}) {
  const thumb = await createFile({ uploadedBy: userId });
  const n = name || `Search Product ${Date.now()}`;

  return Product.create({
    name: n,
    slug: slugify(n, { lower: true, strict: true }),
    category: "Dairy",
    description: "Test",
    status: "active",
    thumbnailImage: thumb._id,
    galleryImages: [],
    allergens: [],
    storageNotes: null,
  });
}

describe("GET /api/admin/variants/search (E2E)", () => {
  test("401 when not authenticated", async () => {
    const res = await request(app).get("/api/admin/variants/search?q=milk");
    expect(res.status).toBe(401);
  });

  test("200 does not return archived variants", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const product = await createProduct({ userId: admin._id, name: "Milk" });

    await Variant.create({
      product: product._id,
      name: "Milk Active",
      sku: `S-ACT-${Date.now()}`,
      price: 1,
      stockQuantity: 10,
      reservedQuantity: 0,
      lowStockAlert: 5,
      status: "active",
      thumbnailImage: product.thumbnailImage,
    });

    const archived = await Variant.create({
      product: product._id,
      name: "Milk Archived",
      sku: `S-ARC-${Date.now()}`,
      price: 1,
      stockQuantity: 10,
      reservedQuantity: 0,
      lowStockAlert: 5,
      status: "archived",
      thumbnailImage: product.thumbnailImage,
    });

    const res = await request(app)
      .get("/api/admin/variants/search?q=milk&limit=25")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const ids = (res.body.data.variants || []).map((v) => String(v._id));
    expect(ids).not.toContain(String(archived._id));
  });
});
