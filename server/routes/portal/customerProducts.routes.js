"use strict";

const express = require("express");
const asyncHandler = require("../../utils/asyncHandler.util");
const { validateQuery } = require("../../middleware/validate.middleware");
const {
  publicProductsQuerySchema,
} = require("../../validators/product.validators");
const productsPublicController = require("../../controllers/products.public.controller");
const Product = require("../../models/product.model");
const ProductVariant = require("../../models/variant.model");
const { sendOk } = require("../../utils/response.util");

const router = express.Router();

// List all active products (reuses existing public controller)
router.get(
  "/",
  validateQuery(publicProductsQuerySchema),
  asyncHandler(productsPublicController.ListActiveProducts),
);

// Featured products
router.get(
  "/featured",
  asyncHandler(async (req, res) => {
    const products = await Product.find({ status: "active", isFeatured: true })
      .populate("thumbnailImage")
      .lean();
    return sendOk(res, { products });
  }),
);

// Single product (reuses existing public controller)
router.get(
  "/:productId",
  asyncHandler(productsPublicController.GetActiveProduct),
);

module.exports = router;
