const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

const Variant = require("../../../models/variant.model");
const File = require("../../../models/file.model");
const Product = require("../../../models/product.model");

describe("PUT / DELETE /api/admin/variants/variants/:variantId (E2E)", () => {
  test("updating variant thumbnail removes old file record (if orphaned)", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const file1 = await File.create({
      originalName: "thumb1.png",
      filename: "cloudinary_public_id_1",
      mimeType: "image/png",
      sizeBytes: 123,
      url: "https://cdn.test/thumb1.png",
      uploadedBy: admin._id,
    });

    const file2 = await File.create({
      originalName: "thumb2.png",
      filename: "cloudinary_public_id_2",
      mimeType: "image/png",
      sizeBytes: 456,
      url: "https://cdn.test/thumb2.png",
      uploadedBy: admin._id,
    });

    const product = await Product.create({
      name: "Test Product",
      slug: "test-product",
      category: "Test",
      description: "Test description",
      status: "active",
      thumbnailImage: file2._id,
      galleryImages: [],
    });

    const variant = await Variant.create({
      product: product._id,
      name: "Variant A",
      sku: "SKU-A-1",
      price: 10,
      stockQuantity: 10,
      createdBy: admin._id,
      stripeProductId: "prod_test",
      stripePriceId: "price_test",
      thumbnailImage: file1._id,
    });

    const res = await request(app)
      .put(`/api/admin/products/variants/${variant._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ thumbnailImage: "" });

    expect(res.status).toBe(200);

    const vAfter = await Variant.findById(variant._id);
    expect(vAfter.thumbnailImage).toBeNull();

    const f1After = await File.findById(file1._id);
    expect(f1After).toBeNull();

    const f2After = await File.findById(file2._id);
    expect(f2After).not.toBeNull();
  });
});
