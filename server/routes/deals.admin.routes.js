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
const controller = require("../controllers/deals.admin.controller");
const {
  createDealSchema,
  updateDealSchema,
  listDealsQuerySchema,
  dealIdParamSchema,
} = require("../validators/deal.validators");

const router = express.Router();

router.use(requireAuth);
router.use(authLimiter);

router.get(
  "/",
  requirePermission("promotions.read"),
  validateQuery(listDealsQuerySchema),
  asyncHandler(controller.ListDeals),
);

router.get(
  "/:dealId",
  requirePermission("promotions.read"),
  validateParams(dealIdParamSchema),
  asyncHandler(controller.GetDeal),
);

router.post(
  "/",
  requirePermission("promotions.create"),
  validateBody(createDealSchema),
  asyncHandler(controller.CreateDeal),
);

router.patch(
  "/:dealId",
  requirePermission("promotions.update"),
  validateParams(dealIdParamSchema),
  validateBody(updateDealSchema),
  asyncHandler(controller.UpdateDeal),
);

router.post(
  "/:dealId/archive",
  requirePermission("promotions.delete"),
  validateParams(dealIdParamSchema),
  asyncHandler(controller.ArchiveDeal),
);

router.delete(
  "/:dealId",
  requirePermission("promotions.delete"),
  validateParams(dealIdParamSchema),
  asyncHandler(controller.DeactivateDeal),
);

module.exports = router;
