// src/services/variants.admin.service.js
const Product = require("../models/product.model");
const Variant = require("../models/variant.model");
const stripeService = require("./stripe.service");

const base64ToTempFile = require("../utils/base64ToTempFile.util");
const {
  uploadAndCreateFile,
  deleteFileIfOrphaned,
} = require("./files.service");

/**
 * Create variant (Stripe-integrated + CDN images)
 */
async function CreateVariant({ productId, body, userId }) {
  const product = await Product.findById(productId);
  if (!product) {
    return { success: false, message: "Product not found" };
  }

  // 1️⃣ Stripe Product
  const { stripeProductId } = await stripeService.createStripeProduct({
    name: `${product.name} - ${body.name}`,
    metadata: {
      productId: productId.toString(),
      variantName: body.name,
    },
  });

  // 2️⃣ Stripe Price
  const { stripePriceId } = await stripeService.createStripePrice({
    stripeProductId,
    amount: body.price,
  });

  // 3️⃣ Upload images (optional)
  let thumbnailImage = null;

  if (body.thumbnailImage?.startsWith("data:")) {
    const tmp = await base64ToTempFile(body.thumbnailImage);

    const uploaded = await uploadAndCreateFile({
      ...tmp,
      uploadedBy: userId,
      folder: "litwebs/variants/thumbnails",
    });

    if (uploaded.success) {
      thumbnailImage = uploaded.data._id;
    }
  }
  // 4️⃣ Persist variant
  const variant = await Variant.create({
    ...body,
    product: productId,
    createdBy: userId,
    stripeProductId,
    stripePriceId,
    thumbnailImage,
  });

  const populatedVariant = await Variant.findById(variant._id).populate(
    "thumbnailImage",
  );

  return { success: true, data: { variant: populatedVariant || variant } };
}

/**
 * List variants for product
 */
async function ListVariants({
  productId,
  page = 1,
  pageSize = 20,
  status = "active",
  search,
}) {
  const product = await Product.findById(productId);
  if (!product) {
    return { success: false, statusCode: 404, message: "Product not found" };
  }

  const query = {
    product: productId,
    ...(status && status !== "all" ? { status } : {}),
  };

  if (typeof search === "string" && search.trim().length > 0) {
    const rx = new RegExp(search.trim(), "i");
    query.$or = [{ name: rx }, { sku: rx }];
  }

  const skip = (page - 1) * pageSize;

  const [total, variants, statsAgg] = await Promise.all([
    Variant.countDocuments(query),
    Variant.find(query)
      .populate("thumbnailImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize),

    // Stats for the whole product (not affected by paging/search/status filter)
    Variant.aggregate([
      { $match: { product: product._id } },
      {
        $project: {
          status: 1,
          lowStockAlert: { $ifNull: ["$lowStockAlert", 0] },
          available: {
            $subtract: [
              { $ifNull: ["$stockQuantity", 0] },
              { $ifNull: ["$reservedQuantity", 0] },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
          },
          inactive: {
            $sum: { $cond: [{ $eq: ["$status", "inactive"] }, 1, 0] },
          },
          lowStock: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "active"] },
                    { $gt: ["$lowStockAlert", 0] },
                    { $gt: ["$available", 0] },
                    { $lte: ["$available", "$lowStockAlert"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          outOfStock: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "active"] },
                    { $lte: ["$available", 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const stats =
    statsAgg && statsAgg[0]
      ? {
          total: Number(statsAgg[0].total || 0),
          active: Number(statsAgg[0].active || 0),
          inactive: Number(statsAgg[0].inactive || 0),
          lowStock: Number(statsAgg[0].lowStock || 0),
          outOfStock: Number(statsAgg[0].outOfStock || 0),
        }
      : { total: 0, active: 0, inactive: 0, lowStock: 0, outOfStock: 0 };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    success: true,
    data: { variants, stats },
    meta: {
      total,
      page,
      pageSize,
      totalPages,
    },
  };
}

/**
 * Update variant
 * - Price change → NEW Stripe price
 * - Images uploaded only if base64
 */
async function UpdateVariant({ variantId, body, userId }) {
  const variant = await Variant.findById(variantId);
  if (!variant) {
    return { success: false, message: "Variant not found" };
  }

  const previousThumbnailId = variant.thumbnailImage
    ? String(variant.thumbnailImage)
    : null;

  // 🔁 Price change → new Stripe price
  if (body.price !== undefined && body.price !== variant.price) {
    const { stripePriceId } = await stripeService.createStripePrice({
      stripeProductId: variant.stripeProductId,
      amount: body.price,
    });

    variant.stripePriceId = stripePriceId;
    variant.price = body.price;
  }

  // Thumbnail replace
  if (body.thumbnailImage === null || body.thumbnailImage === "") {
    variant.thumbnailImage = null;
  } else if (body.thumbnailImage?.startsWith("data:")) {
    const tmp = await base64ToTempFile(body.thumbnailImage);

    const uploaded = await uploadAndCreateFile({
      ...tmp,
      uploadedBy: userId,
      folder: "litwebs/variants/thumbnails",
    });

    if (uploaded.success) {
      variant.thumbnailImage = uploaded.data._id;
    }
  }

  // Normal updates
  if (body.name !== undefined) variant.name = body.name;
  if (body.stockQuantity !== undefined)
    variant.stockQuantity = body.stockQuantity;
  if (body.lowStockAlert !== undefined)
    variant.lowStockAlert = body.lowStockAlert;
  if (body.status !== undefined) variant.status = body.status;

  await variant.save();

  // If thumbnail changed (or was removed), remove old file record if now orphaned.
  const nextThumbnailId = variant.thumbnailImage
    ? String(variant.thumbnailImage)
    : null;

  if (previousThumbnailId && previousThumbnailId !== nextThumbnailId) {
    await deleteFileIfOrphaned(previousThumbnailId);
  }

  const populatedVariant = await Variant.findById(variant._id).populate(
    "thumbnailImage",
  );

  return { success: true, data: { variant: populatedVariant || variant } };
}

/**
 * Disable variant (soft delete)
 */
async function DeleteVariant({ variantId }) {
  const variant = await Variant.findById(variantId);
  if (!variant) {
    return { success: false, message: "Variant not found" };
  }

  // Archive Stripe product
  await stripeService.archiveStripeProduct(variant.stripeProductId);

  variant.status = "inactive";
  await variant.save();

  return { success: true };
}

/**
 * Search variants globally (admin autocomplete)
 */
async function SearchVariants({ q, limit = 10 } = {}) {
  const queryText = String(q || "").trim();
  if (!queryText) {
    return { success: true, data: { variants: [] } };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 25);
  const rx = new RegExp(queryText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

  // Match by variant name/sku OR product name/slug/category
  const products = await Product.find({
    $or: [{ name: rx }, { slug: rx }, { category: rx }],
  })
    .select("_id")
    .limit(200)
    .lean();
  const productIds = products.map((p) => p._id);

  const variants = await Variant.find({
    $or: [
      { name: rx },
      { sku: rx },
      ...(productIds.length > 0 ? [{ product: { $in: productIds } }] : []),
    ],
  })
    .select("name sku product status")
    .populate({ path: "product", select: "name" })
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean();

  const shaped = variants.map((v) => ({
    _id: String(v._id),
    name: v.name,
    sku: v.sku,
    status: v.status,
    product:
      v.product && typeof v.product === "object"
        ? { name: v.product.name }
        : null,
  }));

  return { success: true, data: { variants: shaped } };
}

module.exports = {
  CreateVariant,
  ListVariants,
  UpdateVariant,
  DeleteVariant,
  SearchVariants,
};
