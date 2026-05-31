const express = require("express");
const multer = require("multer");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const asyncHandler = require("../utils/asyncHandler.util");
const {
  validateBody,
  validateQuery,
  validateParams,
} = require("../middleware/validate.middleware");
const { apiLimiter } = require("../middleware/rateLimit.middleware");
const controller = require("../controllers/reviews.controller");
const {
  createReviewSchema,
  listReviewsQuerySchema,
} = require("../validators/review.validators");

const router = express.Router();

// Disk storage — needed so compressImageForUpload can read the path
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `review-${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file &&
      typeof file.mimetype === "string" &&
      file.mimetype.startsWith("image/")
    ) {
      return cb(null, true);
    }
    const err = new Error("Only image files are allowed");
    err.statusCode = 400;
    return cb(err);
  },
});

router.use(apiLimiter);

// Verify order ID before showing the review form
router.get("/verify/:orderId", asyncHandler(controller.VerifyOrderId));

// Submit a review (multipart/form-data; image is optional)
router.post(
  "/",
  upload.single("image"),
  validateBody(createReviewSchema),
  asyncHandler(controller.CreateReview),
);

// List visible reviews (paginated)
router.get(
  "/",
  validateQuery(listReviewsQuerySchema),
  asyncHandler(controller.ListPublicReviews),
);

module.exports = router;
