const request = require("supertest");
const app = require("../../testApp");

const Discount = require("../../../models/discount.model");
const Product = require("../../../models/product.model");
const Variant = require("../../../models/variant.model");
const File = require("../../../models/file.model");
const slugify = require("slugify");
const mongoose = require("mongoose");

async function createFile() {
  return File.create({
    originalName: "img.jpg",
    filename: `test/img-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    mimeType: "image/jpeg",
    sizeBytes: 1,
    url: "https://example.com/img.jpg",
    uploadedBy: new mongoose.Types.ObjectId(),
  });
}

async function createProduct() {
  const thumb = await createFile();
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

describe("GET /api/discounts/active (PUBLIC)", () => {
  test("does not include archived variants in variant-scoped discounts", async () => {
    const product = await createProduct();

    const activeVariant = await Variant.create({
      product: product._id,
      name: "Active Variant",
      sku: `D-ACT-${Date.now()}`,
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
      sku: `D-ARC-${Date.now()}`,
      price: 1,
      stockQuantity: 10,
      reservedQuantity: 0,
      lowStockAlert: 5,
      status: "archived",
      thumbnailImage: product.thumbnailImage,
      stripeProductId: "prod_test",
      stripePriceId: "price_test",
    });

    await Discount.create({
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
    });

    const res = await request(app).get("/api/discounts/active");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const items = res.body.data.items || [];
    expect(items.length).toBe(1);

    const [discount] = items;
    expect(discount.variants).toEqual(["Active Variant"]);
  });
});
