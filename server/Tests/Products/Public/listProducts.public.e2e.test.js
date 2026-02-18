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
  const n = name || `List Product ${Date.now()}`;
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
  sku,
  price = 2.5,
} = {}) {
  const thumb = await createFile();
  const now = Date.now();
  return Variant.create({
    product: productId,
    name: `Variant ${now}`,
    sku: sku || `SKU-${now}-${Math.floor(Math.random() * 1000)}`,
    price,
    stockQuantity: 10,
    reservedQuantity: 0,
    lowStockAlert: 5,
    status,
    thumbnailImage: thumb._id,
  });
}

describe("GET /api/products (PUBLIC)", () => {
  test("returns active products only", async () => {
    const res = await request(app).get("/api/products");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  test("does not return archived products or products without active variants", async () => {
    const activeWithActiveVariant = await createProduct({
      name: "Active With Active",
    });
    await createVariant({
      productId: activeWithActiveVariant._id,
      status: "active",
      sku: `A-${Date.now()}`,
    });

    const activeWithOnlyArchivedVariant = await createProduct({
      name: "Active With Archived",
    });
    await createVariant({
      productId: activeWithOnlyArchivedVariant._id,
      status: "archived",
      sku: `AR-${Date.now()}`,
    });

    const activeWithOnlyInactiveVariant = await createProduct({
      name: "Active With Inactive",
    });
    await createVariant({
      productId: activeWithOnlyInactiveVariant._id,
      status: "inactive",
      sku: `I-${Date.now()}`,
    });

    const archivedProductWithActiveVariant = await createProduct({
      status: "archived",
      name: "Archived Product",
    });
    await createVariant({
      productId: archivedProductWithActiveVariant._id,
      status: "active",
      sku: `X-${Date.now()}`,
    });

    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);

    const items = res.body.data.items || [];
    const ids = items.map((p) => String(p.id));

    expect(ids).toContain(String(activeWithActiveVariant._id));
    expect(ids).not.toContain(String(activeWithOnlyArchivedVariant._id));
    expect(ids).not.toContain(String(activeWithOnlyInactiveVariant._id));
    expect(ids).not.toContain(String(archivedProductWithActiveVariant._id));
  });

  test("does not expose stripe fields", async () => {
    const res = await request(app).get("/api/products");

    expect(JSON.stringify(res.body)).not.toContain("stripe");
  });
});
