"use strict";

jest.mock("../../models/review.model", () => ({
  init: jest.fn().mockResolvedValue(undefined),
  findOne: jest.fn(),
  create: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock("../../models/order.model", () => ({
  init: jest.fn().mockResolvedValue(undefined),
  findOne: jest.fn(),
}));
jest.mock("../../config/cloudinary", () => ({
  uploader: { upload: jest.fn(), destroy: jest.fn() },
  api: { delete_resources: jest.fn() },
}));
jest.mock("../../utils/compressImageForUpload.util", () => jest.fn());

const Review = require("../../models/review.model");
const Order = require("../../models/order.model");
const service = require("../../services/reviews.service");

const leanResult = (value) => ({ lean: jest.fn().mockResolvedValue(value) });

describe("reviews service approval-first moderation", () => {
  beforeEach(() => jest.clearAllMocks());

  test("creates a valid review hidden until an administrator approves it", async () => {
    Order.findOne.mockReturnValue(leanResult({ orderId: "ORD-100" }));
    Review.findOne.mockReturnValue(leanResult(null));
    Review.create.mockImplementation(async (value) => ({ _id: "review-1", ...value }));

    const result = await service.CreateReview({
      body: {
        orderId: "ORD-100",
        customerName: "Sarah M.",
        description: "Excellent delivery",
        rating: 5,
      },
    });

    expect(result.success).toBe(true);
    expect(Review.create).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "ORD-100", isVisible: false }),
    );
    expect(result.data.review.isVisible).toBe(false);
  });

  test("public listing and average include visible reviews only", async () => {
    const select = jest.fn().mockReturnValue(leanResult([{ _id: "visible-1", rating: 5 }]));
    const limit = jest.fn().mockReturnValue({ select });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    Review.find.mockReturnValue({ sort });
    Review.countDocuments.mockResolvedValue(1);
    Review.aggregate.mockResolvedValue([{ _id: null, avg: 5 }]);

    const result = await service.ListPublicReviews({ page: 1, pageSize: 9 });

    expect(Review.find).toHaveBeenCalledWith({ isVisible: true });
    expect(Review.countDocuments).toHaveBeenCalledWith({ isVisible: true });
    expect(Review.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([{ $match: { isVisible: true } }]),
    );
    expect(result.meta).toMatchObject({ total: 1, averageRating: 5 });
  });

  test("a pending hidden review still blocks a duplicate for the same order", async () => {
    Order.findOne.mockReturnValue(leanResult({ orderId: "ORD-100" }));
    Review.findOne.mockReturnValue(
      leanResult({ _id: "pending-1", orderId: "ORD-100", isVisible: false }),
    );

    const result = await service.VerifyOrderId({ orderId: "ORD-100" });

    expect(result).toMatchObject({ success: false, statusCode: 409 });
  });

  test("returns a conflict when simultaneous submissions hit the unique order constraint", async () => {
    Order.findOne.mockReturnValue(leanResult({ orderId: "ORD-100" }));
    Review.findOne.mockReturnValue(leanResult(null));
    Review.create.mockRejectedValue(
      Object.assign(new Error("duplicate key"), { code: 11000 }),
    );

    const result = await service.CreateReview({
      body: {
        orderId: "ORD-100",
        customerName: "Sarah M.",
        description: "Excellent delivery",
        rating: 5,
      },
    });

    expect(result).toMatchObject({ success: false, statusCode: 409 });
  });

  test("administrator visibility update publishes a pending review", async () => {
    const updated = { _id: "review-1", isVisible: true };
    const lean = jest.fn().mockResolvedValue(updated);
    const select = jest.fn().mockReturnValue({ lean });
    Review.findByIdAndUpdate.mockReturnValue({ select });

    const result = await service.UpdateReviewVisibility({
      reviewId: "review-1",
      isVisible: true,
    });

    expect(Review.findByIdAndUpdate).toHaveBeenCalledWith(
      "review-1",
      { $set: { isVisible: true } },
      { new: true },
    );
    expect(result.data.review.isVisible).toBe(true);
  });
});
