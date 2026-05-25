const express = require("express");
const Joi = require("joi");

const asyncHandler = require("../utils/asyncHandler.util");
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { authLimiter } = require("../middleware/rateLimit.middleware");
const {
  validateBody,
  validateQuery,
  validateParams,
} = require("../middleware/validate.middleware");

const controller = require("../controllers/announcements.controller");
const {
  createAnnouncementSchema,
  updateAnnouncementSchema,
} = require("../validators/announcement.validators");
const { objectIdParamSchema } = require("../validators/common.validators");

const router = express.Router();

router.use(requireAuth);
router.use(authLimiter);

router.get(
  "/",
  requirePermission("announcements.read"),
  validateQuery(
    Joi.object({
      page: Joi.number().integer().min(1).optional(),
      pageSize: Joi.number().integer().min(1).max(100).optional(),
    }).unknown(false),
  ),
  asyncHandler(controller.ListAnnouncements),
);

router.post(
  "/",
  requirePermission("announcements.create"),
  validateBody(createAnnouncementSchema),
  asyncHandler(controller.CreateAnnouncement),
);

router.patch(
  "/:announcementId",
  requirePermission("announcements.update"),
  validateParams(objectIdParamSchema("announcementId")),
  validateBody(updateAnnouncementSchema),
  asyncHandler(controller.UpdateAnnouncement),
);

router.delete(
  "/:announcementId",
  requirePermission("announcements.delete"),
  validateParams(objectIdParamSchema("announcementId")),
  asyncHandler(controller.DeleteAnnouncement),
);

module.exports = router;
