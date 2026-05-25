const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const controller = require("../controllers/announcements.controller");

const router = express.Router();

// Public endpoint — no auth required
router.get("/active", asyncHandler(controller.GetActiveAnnouncement));

module.exports = router;
