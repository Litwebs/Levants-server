const { parseDealImageData, MAX_DEAL_IMAGE_BYTES } = require("../../utils/dealImage.util");
const { createDealSchema } = require("../../validators/deal.validators");

describe("Deals / bounded image input validation", () => {
  test.each([MAX_DEAL_IMAGE_BYTES - 1, MAX_DEAL_IMAGE_BYTES])("accepts Base64 size boundary %s without a large payload regex", size => {
    const data = "data:image/png;base64," + Buffer.alloc(size).toString("base64");
    expect(parseDealImageData(data).decodedSize).toBe(size);
    expect(createDealSchema.validate({ name: "Boundary image", image: data, items: [{ variantId: "507f1f77bcf86cd799439011", quantity: 1 }], packagePrice: 1 }).error).toBeUndefined();
  });
  test("rejects one byte over the limit even when encoded length matches the maximum-size image", () => {
    const data = "data:image/png;base64," + Buffer.alloc(MAX_DEAL_IMAGE_BYTES + 1).toString("base64");
    expect(() => parseDealImageData(data)).toThrow(/5 MB/);
    expect(createDealSchema.validate({ name: "Oversized", publicationStatus: "draft", image: data }).error).toBeDefined();
  });
  test.each(["data:image/svg+xml;base64,AAAA", "data:image/png;base64,A===", "data:image/png;base64,AA=A", "data:image/png;base64,A", "data:image/png;base64,@@@@", "data:image/png;base64,"])("rejects invalid format or padding: %s", data => {
    expect(() => parseDealImageData(data)).toThrow(/JPG, PNG or WEBP/);
  });
});
