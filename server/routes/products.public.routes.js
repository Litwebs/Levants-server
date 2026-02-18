// routes/product.public.routes.js
const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const { validateQuery } = require("../middleware/validate.middleware");
const {
  publicProductsQuerySchema,
} = require("../validators/product.validators");

const productsPublicController = require("../controllers/products.public.controller");

const router = express.Router();

router.get(
  "/",
  validateQuery(publicProductsQuerySchema),
  asyncHandler(productsPublicController.ListActiveProducts),
);

router.get(
  "/:productId",
  asyncHandler(productsPublicController.GetActiveProduct),
);

module.exports = router;
