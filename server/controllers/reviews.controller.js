const service = require("../services/reviews.service");
const { sendOk, sendErr } = require("../utils/response.util");

// ── Public ──────────────────────────────────────

const VerifyOrderId = async (req, res) => {
  const result = await service.VerifyOrderId({ orderId: req.params.orderId });
  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message,
    });
  }
  return sendOk(res, null);
};

const CreateReview = async (req, res) => {
  const result = await service.CreateReview({ body: req.body, file: req.file });
  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message,
    });
  }
  return sendOk(res, result.data);
};

const ListPublicReviews = async (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 9);
  const result = await service.ListPublicReviews({ page, pageSize });
  return sendOk(res, result.data, { meta: result.meta });
};

// ── Admin ────────────────────────────────────────

const ListReviewsAdmin = async (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);
  const { search, visibility, rating, sort } = req.query;
  const result = await service.ListReviewsAdmin({
    page,
    pageSize,
    search,
    visibility,
    rating,
    sort,
  });
  return sendOk(res, result.data, { meta: result.meta });
};

const UpdateReviewVisibility = async (req, res) => {
  const result = await service.UpdateReviewVisibility({
    reviewId: req.params.reviewId,
    isVisible: req.body.isVisible,
  });
  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message,
    });
  }
  return sendOk(res, result.data);
};

const DeleteReview = async (req, res) => {
  const result = await service.DeleteReview({ reviewId: req.params.reviewId });
  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message,
    });
  }
  return sendOk(res, result.data);
};

const BulkDeleteReviews = async (req, res) => {
  const result = await service.BulkDeleteReviews({ ids: req.body.ids });
  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message,
    });
  }
  return sendOk(res, result.data);
};

const BulkUpdateVisibility = async (req, res) => {
  const result = await service.BulkUpdateVisibility({
    ids: req.body.ids,
    isVisible: req.body.isVisible,
  });
  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message,
    });
  }
  return sendOk(res, result.data);
};

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
