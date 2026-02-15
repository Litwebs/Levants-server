const request = require("supertest");
const app = require("../../testApp");

const Discount = require("../../../models/discount.model");
const Product = require("../../../models/product.model");
const Variant = require("../../../models/variant.model");
const File = require("../../../models/file.model");
const slugify = require("slugify");
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

async function createProduct({ userId } = {}) {
  const thumb = await createFile({ uploadedBy: userId });
  const name = `Discount Product ${Date.now()}`;
  return Product.create({
    name,
    slug: slugify(name, { lower: true, strict: true }),
    category: "Dairy",
    description: "Test",
    status: "active",
    thumbnailImage: thumb._id,
    galleryImages: [],
    allergens: [],
    storageNotes: null,
  });
}

describe("GET /api/admin/discounts/:discountId (ADMIN)", () => {
  test("401 when not authenticated", async () => {
    const res = await request(app).get(
      "/api/admin/discounts/64f000000000000000000000",
    );
    expect(res.status).toBe(401);
  });

  test("200 excludes archived variants from details", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const product = await createProduct({ userId: admin._id });

    const activeVariant = await Variant.create({
      product: product._id,
      name: "Active Variant",
      sku: `D2-ACT-${Date.now()}`,
      price: 1,
      stockQuantity: 10,
      reservedQuantity: 0,
      lowStockAlert: 5,
      status: "active",
      thumbnailImage: product.thumbnailImage,
      stripeProductId: "prod_test",
      stripePriceId: "price_test",
    });

    const archivedVariant = await Variant.create({
      product: product._id,
      name: "Archived Variant",
      sku: `D2-ARC-${Date.now()}`,
      price: 1,
      stockQuantity: 10,
      reservedQuantity: 0,
      lowStockAlert: 5,
      status: "archived",
      thumbnailImage: product.thumbnailImage,
      stripeProductId: "prod_test",
      stripePriceId: "price_test",
    });

    const discount = await Discount.create({
      name: "Variant Discount",
      code: `DISC-${Date.now()}`,
      kind: "percent",
      percentOff: 10,
      currency: "GBP",
      scope: "variant",
      variantIds: [activeVariant._id, archivedVariant._id],
      isActive: true,
      startsAt: null,
      endsAt: null,
      stripeCouponId: "coupon_test_123",
      stripePromotionCodeId: "promo_test_123",
      createdBy: admin._id,
    });

    const res = await request(app)
      .get(`/api/admin/discounts/${discount._id}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const variants = res.body.data.variants || [];
    expect(variants.length).toBe(1);
    expect(String(variants[0]._id)).toBe(String(activeVariant._id));
    expect(variants[0].name).toBe("Active Variant");
  });
});
