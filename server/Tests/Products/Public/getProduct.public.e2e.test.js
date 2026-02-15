const request = require("supertest");
const app = require("../../testApp");

const slugify = require("slugify");

const mongoose = require("mongoose");

const Product = require("../../../models/product.model");
const Variant = require("../../../models/variant.model");
const File = require("../../../models/file.model");

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

async function createProduct({ status = "active", name } = {}) {
  const thumb = await createFile();
  const n = name || `Public Product ${Date.now()}`;
  return Product.create({
    name: n,
    slug: slugify(n, { lower: true, strict: true }),
    category: "Dairy",
    description: "Test",
    status,
    thumbnailImage: thumb._id,
    galleryImages: [],
    allergens: [],
    storageNotes: null,
  });
}

async function createVariant({
  productId,
  status = "active",
  name,
  sku,
  stockQuantity = 10,
} = {}) {
  const thumb = await createFile();
  const now = Date.now();

  return Variant.create({
    product: productId,
    name: name || `Variant ${now}`,
    sku: sku || `SKU-${now}-${Math.floor(Math.random() * 1000)}`,
    price: 2.5,
    stockQuantity,
    reservedQuantity: 0,
    lowStockAlert: 5,
    status,
    thumbnailImage: thumb._id,
  });
}

describe("GET /api/products/:productId (PUBLIC)", () => {
  test("404 for archived product", async () => {
    const res = await request(app).get(
      "/api/products/64f000000000000000000000",
    );

    expect(res.status).toBe(404);
  });

  test("404 when product has no active variants", async () => {
    const product = await createProduct();

    await createVariant({ productId: product._id, status: "inactive" });
    await createVariant({ productId: product._id, status: "archived" });

    const res = await request(app).get(`/api/products/${product._id}`);
    expect(res.status).toBe(404);
  });

  test("200 and excludes archived variants", async () => {
    const product = await createProduct();

    const activeVariant = await createVariant({
      productId: product._id,
      status: "active",
      name: "Active V",
      sku: `ACTIVE-${Date.now()}`,
    });
    await createVariant({
      productId: product._id,
      status: "archived",
      name: "Archived V",
      sku: `ARCH-${Date.now()}`,
    });

    const res = await request(app).get(`/api/products/${product._id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const variants = res.body.data.variants || [];
    const variantIds = variants.map((v) => String(v.id));
    expect(variantIds).toContain(String(activeVariant._id));
    expect(variantIds.length).toBe(1);
  });
});
