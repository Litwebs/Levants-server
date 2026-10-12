const { createDealSchema, updateDealSchema, listDealsQuerySchema, catalogQuerySchema } = require("../../validators/deal.validators");
const variantId = "507f1f77bcf86cd799439011";
const valid = { name: "Milk package", items: [{ variantId, quantity: 2 }], packagePrice: 8 };

describe("Deals / request schemas", () => {
  test("creation normalises name, currency and boolean defaults", () => {
    const { error, value } = createDealSchema.validate({ ...valid, name: "  Milk package  ", currency: "gbp" });
    expect(error).toBeUndefined();
    expect(value).toMatchObject({ name: "Milk package", currency: "GBP", isActive: true, isFeatured: false, sortOrder: 0 });
  });
  test.each([1, 999])("quantity boundary %s is supported", quantity => {
    expect(createDealSchema.validate({ ...valid, items: [{ variantId, quantity }] }).error).toBeUndefined();
  });
  test.each([0, -1, 1.5, 1000])("quantity %s is rejected", quantity => {
    expect(createDealSchema.validate({ ...valid, items: [{ variantId, quantity }] }).error).toBeDefined();
  });
  test("30 components are allowed and 31 are rejected", () => {
    const items = Array.from({ length: 30 }, () => ({ variantId, quantity: 1 }));
    expect(createDealSchema.validate({ ...valid, items }).error).toBeUndefined();
    expect(createDealSchema.validate({ ...valid, items: [...items, items[0]] }).error).toBeDefined();
  });
  test("partial updates do not inject creation defaults", () => {
    expect(updateDealSchema.validate({ description: "Updated" }).value).toEqual({ description: "Updated" });
  });
  test.each([{}, { unknown: true }, { items: [] }, { currency: "USD" }])("invalid partial update %j is rejected", body => {
    expect(updateDealSchema.validate(body).error).toBeDefined();
  });
  test("list filters normalise query strings", () => {
    expect(listDealsQuerySchema.validate({ page: "2", pageSize: "100", featured: "false", search: " milk " }).value).toEqual({ page: 2, pageSize: 100, featured: false, search: "milk" });
  });
  test.each([{ page: 0 }, { pageSize: 101 }, { sort: "invalid" }, { status: "published" }])("unsupported list filter %j is rejected", query => {
    expect(listDealsQuerySchema.validate(query).error).toBeDefined();
  });
  test("catalog defaults browse without filtering available stock", () => {
    expect(catalogQuerySchema.validate({}).value).toMatchObject({ q: "", page: 1, pageSize: 20, inStock: false, stock: "all", sort: "newest" });
  });
});
