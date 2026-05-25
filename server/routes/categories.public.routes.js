const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const controller = require("../controllers/categories.controller");

const router = express.Router();

// Public endpoint — no auth required
router.get("/", asyncHandler(controller.GetPublicCategories));

module.exports = router;
