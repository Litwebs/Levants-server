// src/services/variants.admin.service.js
const Product = require("../models/product.model");
const Variant = require("../models/variant.model");
const stripeService = require("./stripe.service");

const base64ToTempFile = require("../utils/base64ToTempFile.util");
const { uploadAndCreateFile } = require("./files.service");

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
  if (body.thumbnailImage?.startsWith("data:")) {
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

module.exports = {
  CreateVariant,
  ListVariants,
  UpdateVariant,
  DeleteVariant,
};
