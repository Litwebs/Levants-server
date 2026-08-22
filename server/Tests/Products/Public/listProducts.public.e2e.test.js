const request = require("supertest");
const app = require("../../testApp");

const slugify = require("slugify");

const mongoose = require("mongoose");

const Product = require("../../../models/product.model");
const Variant = require("../../../models/variant.model");
const File = require("../../../models/file.model");
const Category = require("../../../models/category.model");

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

async function createProduct(
  { status = "active", name, category = "Dairy" } = {},
) {
  const thumb = await createFile();
  const n = name || `List Product ${Date.now()}`;
  return Product.create({
    name: n,
    slug: slugify(n, { lower: true, strict: true }),
    category,
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
  description,
  ingredients,
  allergens,
  nutritionalInformation,
} = {}) {
  const thumb = await createFile();
  const now = Date.now();
  return Variant.create({
    product: productId,
    name: `Variant ${now}`,
    description,
    ingredients,
    allergens,
    nutritionalInformation,
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

  test("returns all categories in meta", async () => {
    await Category.create({ title: "Dairy", subtitle: "Fresh dairy" });
    const p = await createProduct({ name: "Category Product" });
    await createVariant({
      productId: p._id,
      status: "active",
      sku: `C-${Date.now()}`,
    });

    const res = await request(app).get("/api/products");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.meta.categories)).toBe(true);
    expect(res.body.meta.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Dairy", subtitle: "Fresh dairy" }),
      ]),
    );
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

  test("returns variant-specific product information", async () => {
    const product = await createProduct({ name: "Variant Information" });
    const variant = await createVariant({
      productId: product._id,
      sku: `INFO-${Date.now()}`,
      description: "Description for this size",
      ingredients: "Milk, cultures",
      allergens: ["Milk"],
      nutritionalInformation: "Protein: 4g per 100ml",
    });

    const res = await request(app).get("/api/products");

    expect(res.status).toBe(200);
    const item = (res.body.data.items || []).find(
      (candidate) => String(candidate.id) === String(product._id),
    );
    const responseVariant = item?.variants?.find(
      (candidate) => String(candidate.id) === String(variant._id),
    );

    expect(responseVariant).toMatchObject({
      description: "Description for this size",
      ingredients: "Milk, cultures",
      allergens: ["Milk"],
      nutritionalInformation: "Protein: 4g per 100ml",
    });
  });

  test("supports comma-separated category filter", async () => {
    const dairy = await createProduct({ name: "MultiCat Dairy" });
    await createVariant({
      productId: dairy._id,
      status: "active",
      sku: `MD-${Date.now()}`,
    });

    const bakeryThumb = await createFile();
    const bakeryName = `MultiCat Bakery ${Date.now()}`;
    const bakery = await Product.create({
      name: bakeryName,
      slug: slugify(bakeryName, { lower: true, strict: true }),
      category: "Bakery",
      description: "Test",
      status: "active",
      thumbnailImage: bakeryThumb._id,
      galleryImages: [],
      allergens: [],
      storageNotes: null,
    });
    await createVariant({
      productId: bakery._id,
      status: "active",
      sku: `MB-${Date.now()}`,
    });

    const meatThumb = await createFile();
    const meatName = `MultiCat Meat ${Date.now()}`;
    const meat = await Product.create({
      name: meatName,
      slug: slugify(meatName, { lower: true, strict: true }),
      category: "Meat",
      description: "Test",
      status: "active",
      thumbnailImage: meatThumb._id,
      galleryImages: [],
      allergens: [],
      storageNotes: null,
    });
    await createVariant({
      productId: meat._id,
      status: "active",
      sku: `MM-${Date.now()}`,
    });

    const res = await request(app).get("/api/products?category=Dairy,Bakery");
    expect(res.status).toBe(200);

    const ids = (res.body.data.items || []).map((p) => String(p.id));
    expect(ids).toContain(String(dairy._id));
    expect(ids).toContain(String(bakery._id));
    expect(ids).not.toContain(String(meat._id));
  });

  test("supports the storefront category order before pagination", async () => {
    const butter = await createProduct({
      name: "Category Order Butter",
      category: "Butter",
    });
    await createVariant({
      productId: butter._id,
      status: "active",
      sku: `ORDER-BUTTER-${Date.now()}`,
    });

    const milk = await createProduct({
      name: "Category Order Milk",
      category: "Milk",
    });
    await createVariant({
      productId: milk._id,
      status: "active",
      sku: `ORDER-MILK-${Date.now()}`,
    });

    const res = await request(app).get(
      "/api/products?sort=category_order&pageSize=1",
    );

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(String(res.body.data.items[0].id)).toBe(String(milk._id));
    expect(res.body.meta.total).toBe(2);
    expect(res.body.meta.totalPages).toBe(2);
  });
});
