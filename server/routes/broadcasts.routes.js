const express = require("express");
const router = express.Router();

const {
  ListBroadcasts,
  CreateBroadcast,
  UpdateBroadcast,
  DeleteBroadcast,
  SendBroadcastEmail,
  GetActiveBroadcast,
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

// TEMP: bypass permission to confirm auth works
router.post("/:broadcastId/send", requireAuth, SendBroadcastEmail);

module.exports = router;
