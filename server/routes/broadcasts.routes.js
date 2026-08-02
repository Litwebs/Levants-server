const express = require("express");
const router = express.Router();

const {
  ListBroadcasts,
  CreateBroadcast,
  UpdateBroadcast,
  DeleteBroadcast,
  SendBroadcastEmail,
  GetActiveBroadcast,
  PreviewBroadcastAudience,
  GetBroadcastAudienceOptions,
} = require("../controllers/broadcasts.controller");

const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");

router.get("/active", GetActiveBroadcast);

router.get(
  "/",
  requireAuth,
  requirePermission("broadcasts.read"),
  ListBroadcasts,
);

router.get(
  "/audience-options",
  requireAuth,
  requirePermission("broadcasts.read"),
  GetBroadcastAudienceOptions,
);

router.post(
  "/audience-preview",
  requireAuth,
  requirePermission("broadcasts.read"),
  PreviewBroadcastAudience,
);

router.post(
  "/",
  requireAuth,
  requirePermission("broadcasts.create"),
  CreateBroadcast,
);

router.patch(
  "/:broadcastId",
  requireAuth,
  requirePermission("broadcasts.update"),
  UpdateBroadcast,
);

router.delete(
  "/:broadcastId",
  requireAuth,
  requirePermission("broadcasts.delete"),
  DeleteBroadcast,
);

router.post(
  "/:broadcastId/send",
  requireAuth,
  requirePermission("broadcasts.send"),
  SendBroadcastEmail,
);

module.exports = router;
