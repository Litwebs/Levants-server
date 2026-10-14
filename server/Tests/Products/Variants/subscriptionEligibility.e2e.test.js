const request = require("supertest");
const app = require("../../testApp");
const Product = require("../../../models/product.model");
const Variant = require("../../../models/variant.model");
const { createProduct, createVariant } = require("../../Orders/helpers/orderFactory");
const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");
const { migrateVariantEligibility } = require("../../../services/variantEligibilityMigration.service");

jest.mock("../../../services/files.service", () => ({
  uploadAndCreateFile: jest.fn(async () => ({ success: true, data: { _id: "507f191e810c19729de860ea" } })),
  deleteFileIfOrphaned: jest.fn(async () => true),
}));
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2G0qQAAAAASUVORK5CYII=";

test("variant eligibility persists independently, defaults eligible, and rejects invalid or product-level controls", async () => {
  const admin = await createUser({ role: "admin" });
  const auth = await request(app).post("/api/auth/login").send({ email: admin.email, password: "secret123" });
  const cookie = getSetCookieHeader(auth);
  const product = await createProduct();
  const create = body => request(app).post(`/api/admin/products/${product.id}/variants`).set("Cookie", cookie)
    .send({ name: "500ml", sku: "MILK-500", price: 5, stockQuantity: 10, thumbnailImage: image, ...body });
  const a = await create({});
  const b = await create({ name: "1 litre", sku: "MILK-1L", isSubscriptionEligible: false });
  expect(a.status).toBe(201); expect(b.status).toBe(201);
  expect(a.body.data.variant.isSubscriptionEligible).toBe(true);
  expect(b.body.data.variant.isSubscriptionEligible).toBe(false);
  const url = `/api/admin/products/variants/${a.body.data.variant._id}`;
  for (const flag of [false, true, false]) {
    const updated = await request(app).put(url).set("Cookie", cookie).send({ isSubscriptionEligible: flag });
    expect(updated.status).toBe(200);
    expect(updated.body.data.variant.isSubscriptionEligible).toBe(flag);
    expect((await Variant.findById(b.body.data.variant._id)).isSubscriptionEligible).toBe(false);
    expect((await request(app).get(url).set("Cookie", cookie)).body.data.variant.isSubscriptionEligible).toBe(flag);
  }
  await request(app).put(url).set("Cookie", cookie).send({ description: "A new description" }).expect(200);
  expect((await Variant.findById(a.body.data.variant._id)).isSubscriptionEligible).toBe(false);
  for (const value of ["false", 0, null, {}]) {
    await request(app).put(url).set("Cookie", cookie).send({ isSubscriptionEligible: value }).expect(400);
    expect((await create({ sku: `INVALID-${String(value)}`, isSubscriptionEligible: value })).status).toBe(400);
  }
  await request(app).put(url).send({ isSubscriptionEligible: true }).expect(401);
  await request(app).put(`/api/admin/products/${product.id}`).set("Cookie", cookie).send({ isSubscriptionEligible: false }).expect(400);
});

test("migration inherits historical product settings once without overriding individual variants", async () => {
  const product = await createProduct();
  await Product.collection.updateOne({ _id: product._id }, { $set: { isSubscriptionEligible: false } });
  const inherited = await createVariant({ product });
  const overridden = await createVariant({ product });
  const normalProduct = await createProduct();
  const normal = await createVariant({ product: normalProduct });
  await Variant.collection.updateMany({ _id: { $in: [inherited._id, normal._id] } }, { $unset: { isSubscriptionEligible: "" } });
  await migrateVariantEligibility();
  expect((await Variant.findById(inherited.id)).isSubscriptionEligible).toBe(false);
  expect((await Variant.findById(overridden.id)).isSubscriptionEligible).toBe(true);
  expect((await Variant.findById(normal.id)).isSubscriptionEligible).toBe(true);
  await Variant.findByIdAndUpdate(inherited.id, { isSubscriptionEligible: true });
  const newlyCreated = await createVariant({ product });
  await migrateVariantEligibility();
  expect((await Variant.findById(inherited.id)).isSubscriptionEligible).toBe(true);
  expect((await Variant.findById(newlyCreated.id)).isSubscriptionEligible).toBe(true);
});
