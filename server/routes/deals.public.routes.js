const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const {
  validateQuery,
  validateParams,
} = require("../middleware/validate.middleware");
const controller = require("../controllers/deals.public.controller");
const {
  listDealsQuerySchema,
  dealSlugParamSchema,
} = require("../validators/deal.validators");

const router = express.Router();

router.get(
  "/",
  validateQuery(listDealsQuerySchema),
  asyncHandler(controller.ListDeals),
);

router.get(
  "/:slug",
  validateParams(dealSlugParamSchema),
  asyncHandler(controller.GetDeal),
);

module.exports = router;
