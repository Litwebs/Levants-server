const mongoose = require("mongoose");

const firstImageId = new mongoose.Types.ObjectId();
const secondImageId = new mongoose.Types.ObjectId();
const mockUploadAndCreateFile = jest.fn();
const mockDeleteFileIfOrphaned = jest.fn();

jest.mock("../../utils/base64ToTempFile.util", () =>
  jest.fn().mockResolvedValue({
    path: "/tmp/deal-image.png",
    originalname: "deal-image.png",
    mimetype: "image/png",
    size: 128,
  }),
);

jest.mock("../../services/files.service", () => ({
  uploadAndCreateFile: (...args) => mockUploadAndCreateFile(...args),
  deleteFileIfOrphaned: (...args) => mockDeleteFileIfOrphaned(...args),
}));

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
        image: "data:image/png;base64,AAAA",
        items: [{ variantId: String(variant._id), quantity: 2 }],
        packagePrice: 8,
      },
    });
    expect(created.success).toBe(true);
    expect(mockUploadAndCreateFile).toHaveBeenCalledTimes(1);
    expect(mockUploadAndCreateFile.mock.calls[0][0]).toMatchObject({
      uploadedBy: userId,
      folder: "litwebs/deals",
      mimetype: "image/png",
    });
    let stored = await Deal.findById(created.data.deal._id).lean();
    expect(String(stored.image)).toBe(String(firstImageId));

    const updated = await updateDeal({
      dealId: String(stored._id),
      body: { image: "data:image/png;base64,BBBB" },
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
        image: "data:image/png;base64,FAIL",
        items: [{ variantId: String(variant._id), quantity: 2 }],
        packagePrice: 8,
      },
    });
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.message).toMatch(/storage unavailable/i);
    expect(await Deal.countDocuments({ name: "Failed Image Package" })).toBe(0);
  });
});
