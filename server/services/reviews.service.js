const Review = require("../models/review.model");
const Order = require("../models/order.model");
const cloudinary = require("../config/cloudinary");
const fs = require("fs/promises");
const compressImageForUpload = require("../utils/compressImageForUpload.util");

// ──────────────────────────────────────────────
// Public
// ──────────────────────────────────────────────

async function VerifyOrderId({ orderId }) {
  const order = await Order.findOne({ orderId }).lean();
  if (!order) {
    return { success: false, statusCode: 404, message: "Order not found" };
  }

  // Prevent duplicate reviews for the same order
  const existing = await Review.findOne({ orderId }).lean();
  if (existing) {
    return {
      success: false,
      statusCode: 409,
      message: "A review has already been submitted for this order",
    };
  }

  return { success: true };
}

async function CreateReview({ body, file }) {
  // Re-verify order exists
  const order = await Order.findOne({ orderId: body.orderId }).lean();
  if (!order) {
    return { success: false, statusCode: 404, message: "Order not found" };
  }

  // Prevent duplicate reviews
  const existing = await Review.findOne({ orderId: body.orderId }).lean();
  if (existing) {
    return {
      success: false,
      statusCode: 409,
      message: "A review has already been submitted for this order",
    };
  }

  let imageUrl = null;
  let imagePublicId = null;

  if (file) {
    let uploadPath = file.path;
    const cleanupPaths = [];

    try {
      const optimized = await compressImageForUpload({
        localPath: file.path,
        mimeType: file.mimetype,
        originalName: file.originalname,
        sizeBytes: file.size,
      });

      uploadPath = optimized.localPath || file.path;
      if (Array.isArray(optimized.cleanupPaths)) {
        cleanupPaths.push(...optimized.cleanupPaths);
      }

      const result = await cloudinary.uploader.upload(uploadPath, {
        folder: "levants/reviews",
        resource_type: "image",
        use_filename: true,
        unique_filename: true,
      });

      imageUrl = result.secure_url;
      imagePublicId = result.public_id;
    } finally {
      await Promise.allSettled(
        [
          ...new Set([uploadPath, file.path, ...cleanupPaths].filter(Boolean)),
        ].map((f) => fs.unlink(f)),
      );
    }
  }

  let review;
  try {
    review = await Review.create({
      orderId: body.orderId,
      customerName: body.customerName,
      description: body.description,
      rating: Number(body.rating),
      imageUrl,
      imagePublicId,
      // Approval-first moderation: a new review is retained for administrators
      // but does not appear publicly or affect public rating statistics.
      isVisible: false,
    });
  } catch (error) {
    // The unique orderId index closes the race between the duplicate check
    // above and two submissions arriving at the same time.
    if (error?.code === 11000) {
      if (imagePublicId) {
        await cloudinary.uploader.destroy(imagePublicId).catch(() => undefined);
      }
      return {
        success: false,
        statusCode: 409,
        message: "A review has already been submitted for this order",
      };
    }
    throw error;
  }

  return { success: true, data: { review } };
}

async function ListPublicReviews({ page = 1, pageSize = 9 }) {
  const skip = (page - 1) * pageSize;

  const [reviews, total, ratingAgg] = await Promise.all([
    Review.find({ isVisible: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .select("-imagePublicId -__v")
      .lean(),
    Review.countDocuments({ isVisible: true }),
    Review.aggregate([
      { $match: { isVisible: true } },
      { $group: { _id: null, avg: { $avg: "$rating" } } },
    ]),
  ]);

  const totalPages = Math.ceil(total / pageSize) || 1;
  const averageRating = ratingAgg[0]
    ? Math.round(ratingAgg[0].avg * 10) / 10
    : null;

  return {
    success: true,
    data: { reviews },
    meta: { total, page, pageSize, totalPages, averageRating },
  };
}

// ──────────────────────────────────────────────
// Admin
// ──────────────────────────────────────────────

async function ListReviewsAdmin({
  page = 1,
  pageSize = 20,
  search,
  visibility,
  rating,
  sort,
}) {
  const skip = (page - 1) * pageSize;

  const filter = {};

  if (search && search.trim()) {
    const re = new RegExp(
      search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    filter.$or = [{ customerName: re }, { orderId: re }];
  }

  if (visibility === "visible") filter.isVisible = true;
  else if (visibility === "hidden") filter.isVisible = false;

  if (rating && rating !== "all") filter.rating = Number(rating);

  const sortMap = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    "rating-high": { rating: -1, createdAt: -1 },
    "rating-low": { rating: 1, createdAt: -1 },
  };
  const sortOrder = sortMap[sort] || { createdAt: -1 };

  const [reviews, total, ratingAgg] = await Promise.all([
    Review.find(filter)
      .sort(sortOrder)
      .skip(skip)
      .limit(pageSize)
      .select("-imagePublicId -__v")
      .lean(),
    Review.countDocuments(filter),
    Review.aggregate([
      { $match: filter },
      { $group: { _id: null, avg: { $avg: "$rating" } } },
    ]),
  ]);

  const totalPages = Math.ceil(total / pageSize) || 1;
  const averageRating = ratingAgg[0]
    ? Math.round(ratingAgg[0].avg * 10) / 10
    : null;

  return {
    success: true,
    data: { reviews },
    meta: { total, page, pageSize, totalPages, averageRating },
  };
}

async function UpdateReviewVisibility({ reviewId, isVisible }) {
  const review = await Review.findByIdAndUpdate(
    reviewId,
    { $set: { isVisible } },
    { new: true },
  )
    .select("-imagePublicId -__v")
    .lean();

  if (!review) {
    return { success: false, statusCode: 404, message: "Review not found" };
  }

  return { success: true, data: { review } };
}

async function DeleteReview({ reviewId }) {
  const review = await Review.findByIdAndDelete(reviewId).lean();
  if (!review) {
    return { success: false, statusCode: 404, message: "Review not found" };
  }

  // Best-effort Cloudinary cleanup
  if (review.imagePublicId) {
    try {
      await cloudinary.uploader.destroy(review.imagePublicId, {
        resource_type: "image",
      });
    } catch (_) {}
  }

  return { success: true, data: { review } };
}

async function BulkDeleteReviews({ ids }) {
  const reviews = await Review.find({ _id: { $in: ids } }).lean();
  if (!reviews.length) {
    return { success: false, statusCode: 404, message: "No reviews found" };
  }

  await Review.deleteMany({ _id: { $in: ids } });

  // Best-effort Cloudinary cleanup
  const publicIds = reviews.map((r) => r.imagePublicId).filter(Boolean);
  if (publicIds.length) {
    try {
      await cloudinary.api.delete_resources(publicIds, {
        resource_type: "image",
      });
    } catch (_) {}
  }

  return { success: true, data: { deleted: reviews.length } };
}

async function BulkUpdateVisibility({ ids, isVisible }) {
  const result = await Review.updateMany(
    { _id: { $in: ids } },
    { $set: { isVisible } },
  );
  return { success: true, data: { updated: result.modifiedCount } };
}

module.exports = {
  VerifyOrderId,
  CreateReview,
  ListPublicReviews,
  ListReviewsAdmin,
  UpdateReviewVisibility,
  DeleteReview,
  BulkDeleteReviews,
  BulkUpdateVisibility,
};
