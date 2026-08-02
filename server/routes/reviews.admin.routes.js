const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { authLimiter } = require("../middleware/rateLimit.middleware");
const {
  validateBody,
  validateQuery,
  validateParams,
} = require("../middleware/validate.middleware");
const { objectIdParamSchema } = require("../validators/common.validators");
const {
  updateReviewVisibilitySchema,
  listReviewsQuerySchema,
  bulkIdsSchema,
  bulkVisibilitySchema,
} = require("../validators/review.validators");
const controller = require("../controllers/reviews.controller");

const router = express.Router();

router.use(requireAuth);
router.use(requirePermission("reviews.read"));
router.use(authLimiter);

// List all reviews (paginated)
router.get(
  "/",
  validateQuery(listReviewsQuerySchema),
  asyncHandler(controller.ListReviewsAdmin),
);

// Bulk delete (must be before /:reviewId)
router.delete(
  "/bulk",
  requirePermission("reviews.delete"),
  validateBody(bulkIdsSchema),
  asyncHandler(controller.BulkDeleteReviews),
);

// Bulk visibility update (must be before /:reviewId)
router.patch(
  "/bulk/visibility",
  requirePermission("reviews.update"),
  validateBody(bulkVisibilitySchema),
  asyncHandler(controller.BulkUpdateVisibility),
);

// Update visibility
router.patch(
  "/:reviewId",
  requirePermission("reviews.update"),
  validateParams(objectIdParamSchema("reviewId")),
  validateBody(updateReviewVisibilitySchema),
  asyncHandler(controller.UpdateReviewVisibility),
);

// Delete a review
router.delete(
  "/:reviewId",
  requirePermission("reviews.delete"),
  validateParams(objectIdParamSchema("reviewId")),
  asyncHandler(controller.DeleteReview),
);

module.exports = router;
