require("./helpers/setup");
const mongoose = require("mongoose");

const firstImageId = new mongoose.Types.ObjectId();
const secondImageId = new mongoose.Types.ObjectId();
const mockUploadAndCreateFile = jest.fn();
const mockDeleteFileIfOrphaned = jest.fn();

jest.mock("../../utils/base64ToTempFile.util", () =>
  jest.fn().mockResolvedValue({
    localPath: "/tmp/deal-image.png",
    originalName: "deal-image.png",
    mimeType: "image/png",
    sizeBytes: 128,
  }),
);

jest.mock("../../services/files.service", () => ({
  uploadAndCreateFile: (...args) => mockUploadAndCreateFile(...args),
  deleteFileIfOrphaned: (...args) => mockDeleteFileIfOrphaned(...args),
}));

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2G0qQAAAAASUVORK5CYII=";
const Deal = require("../../models/deal.model");
const { createDeal, updateDeal } = require("../../services/deals.admin.service");
const { createProduct, createVariant } = require("../Orders/helpers/orderFactory");

describe("deal promotional images", () => {
  beforeEach(() => {
    mockUploadAndCreateFile.mockReset();
    mockDeleteFileIfOrphaned.mockReset();
  });

  test("create stores a promotional image and update replaces it with orphan cleanup", async () => {
    mockUploadAndCreateFile
      .mockResolvedValueOnce({ success: true, data: { _id: firstImageId } })
      .mockResolvedValueOnce({ success: true, data: { _id: secondImageId } });
    mockDeleteFileIfOrphaned.mockResolvedValue({ success: true });

    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const userId = new mongoose.Types.ObjectId();
    const created = await createDeal({
      userId,
      body: {
        name: "Image Package",
        image: image,
        items: [{ variantId: String(variant._id), quantity: 2 }],
        packagePrice: 8,
      },
    });
    expect(created.success).toBe(true);
    expect(mockUploadAndCreateFile).toHaveBeenCalledTimes(1);
    expect(mockUploadAndCreateFile.mock.calls[0][0]).toMatchObject({
      uploadedBy: userId,
      folder: "litwebs/deals",
      mimeType: "image/png",
    });
    let stored = await Deal.findById(created.data.deal._id).lean();
    expect(String(stored.image)).toBe(String(firstImageId));

    const updated = await updateDeal({
      dealId: String(stored._id),
      body: { image: image },
    });
    expect(updated.success).toBe(true);
    expect(mockDeleteFileIfOrphaned).toHaveBeenCalledWith(String(firstImageId));
    stored = await Deal.findById(stored._id).lean();
    expect(String(stored.image)).toBe(String(secondImageId));
  });

  test("failed image upload does not create a deal", async () => {
    mockUploadAndCreateFile.mockResolvedValueOnce({
      success: false,
      message: "storage unavailable",
    });
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const result = await createDeal({
      body: {
        name: "Failed Image Package",
        image: image,
        items: [{ variantId: String(variant._id), quantity: 2 }],
        packagePrice: 8,
      },
    });
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.message).toMatch(/Failed to upload deal image/i);
    expect(await Deal.countDocuments({ name: "Failed Image Package" })).toBe(0);
  });
});

describe("Deals / image validation and recovery", () => {
  beforeEach(() => {
    mockUploadAndCreateFile.mockReset();
    mockDeleteFileIfOrphaned.mockReset().mockResolvedValue({ success: true });
  });

  async function fixture() {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    return { body: { name: "Image recovery package", items: [{ variantId: variant.id, quantity: 2 }], packagePrice: 8 } };
  }

  test.each([
    ["oversized data", () => "data:image/png;base64," + Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64"), /5 MB/i],
    ["declared type differs from actual bytes", () => image.replace("image/png", "image/jpeg"), /could not be read/i],
  ])("%s is rejected before contacting image storage", async (_, buildImage, message) => {
    const { body } = await fixture();
    const result = await createDeal({ body: { ...body, image: buildImage() } });
    expect(result).toMatchObject({ success: false, statusCode: 400 });
    expect(result.message).toMatch(message);
    expect(mockUploadAndCreateFile).not.toHaveBeenCalled();
    expect(await Deal.countDocuments()).toBe(0);
  });

  test.each([["archived image", "image/png", true], ["non-image file", "application/pdf", false]])("managed %s is rejected", async (_, mimeType, isArchived) => {
    const { body } = await fixture();
    const file = await require("../../models/file.model").create({
      originalName: "managed-file", filename: "managed-file", sizeBytes: 100,
      url: "https://cdn.test.com/managed-file", uploadedBy: new mongoose.Types.ObjectId(), mimeType, isArchived,
    });
    expect(await createDeal({ body: { ...body, image: file.id } })).toMatchObject({ success: false, statusCode: 400 });
    expect(await Deal.countDocuments()).toBe(0);
  });

  test("existing managed image is reused without uploading", async () => {
    const { body } = await fixture();
    const file = await require("../../models/file.model").create({ originalName: "managed.png", filename: "managed.png", mimeType: "image/png", sizeBytes: 100,
      url: "https://cdn.test.com/managed.png", uploadedBy: new mongoose.Types.ObjectId() });
    const result = await createDeal({ body: { ...body, image: file.id } });
    expect(result.success).toBe(true);
    expect(String((await Deal.findById(result.data.deal._id)).image)).toBe(file.id);
    expect(mockUploadAndCreateFile).not.toHaveBeenCalled();
  });

  test("clearing an image removes its reference and triggers orphan cleanup", async () => {
    const { body } = await fixture();
    mockUploadAndCreateFile.mockResolvedValue({ success: true, data: { _id: firstImageId } });
    const created = await createDeal({ body: { ...body, image } });
    const result = await updateDeal({ dealId: String(created.data.deal._id), body: { image: null } });
    expect(result.success).toBe(true);
    expect((await Deal.findById(created.data.deal._id)).image).toBeNull();
    expect(mockDeleteFileIfOrphaned).toHaveBeenCalledWith(String(firstImageId));
  });

  test("failed replacement leaves the prior image and persisted deal intact", async () => {
    const { body } = await fixture();
    mockUploadAndCreateFile.mockResolvedValueOnce({ success: true, data: { _id: firstImageId } });
    const created = await createDeal({ body: { ...body, image } });
    mockUploadAndCreateFile.mockResolvedValueOnce({ success: false, message: "Storage unavailable" });
    const result = await updateDeal({ dealId: String(created.data.deal._id), body: { image, name: "Should not persist" } });
    expect(result).toMatchObject({ success: false, statusCode: 500 });
    const saved = await Deal.findById(created.data.deal._id);
    expect(saved.name).toBe(body.name);
    expect(String(saved.image)).toBe(String(firstImageId));
    expect(mockDeleteFileIfOrphaned).not.toHaveBeenCalled();
  });

  test("orphan cleanup failure does not reverse a successful replacement", async () => {
    const { body } = await fixture();
    mockUploadAndCreateFile.mockResolvedValueOnce({ success: true, data: { _id: firstImageId } })
      .mockResolvedValueOnce({ success: true, data: { _id: secondImageId } });
    const created = await createDeal({ body: { ...body, image } });
    mockDeleteFileIfOrphaned.mockRejectedValueOnce(new Error("Cleanup unavailable"));
    expect((await updateDeal({ dealId: String(created.data.deal._id), body: { image } })).success).toBe(true);
    expect(String((await Deal.findById(created.data.deal._id)).image)).toBe(String(secondImageId));
  });
});
