// src/services/products.admin.service.js
const Product = require("../models/product.model");
const Variant = require("../models/variant.model");
const slugify = require("slugify");

const base64ToTempFile = require("../utils/base64ToTempFile.util");

const { uploadAndCreateFile } = require("./files.service");

/**
 * Create product
 */
async function CreateProduct({ body, userId }) {
  const slug = slugify(body.name, { lower: true, strict: true });

  const existing = await Product.findOne({ slug });
  if (existing) {
    return {
      success: false,
      statusCode: 409,
      message: "A product with this name already exists",
    };
  }

  if (!body.thumbnailImage?.startsWith("data:")) {
    return {
      success: false,
      statusCode: 400,
      message: "Thumbnail image is required",
    };
  }

  // === Upload thumbnail ===
  const thumbTmp = await base64ToTempFile(body.thumbnailImage);

  const thumbUpload = await uploadAndCreateFile({
    ...thumbTmp,
    uploadedBy: userId,
    folder: "litwebs/products/thumbnails",
  });

  if (!thumbUpload.success) {
    return {
      success: false,
      statusCode: 500,
      message: "Failed to upload thumbnail image",
    };
  }

  // === Upload gallery ===
  const galleryImageIds = [];

  if (Array.isArray(body.galleryImages)) {
    for (const img of body.galleryImages) {
      if (!img?.startsWith("data:")) continue;

      const tmp = await base64ToTempFile(img);

      const uploaded = await uploadAndCreateFile({
        ...tmp,
        uploadedBy: userId,
        folder: "litwebs/products/gallery",
      });

      if (uploaded.success) {
        galleryImageIds.push(uploaded.data._id);
      }
    }
  }

  const product = await Product.create({
    ...body,
    slug,
    thumbnailImage: thumbUpload.data._id,
    galleryImages: galleryImageIds,
    createdBy: userId,
  });

  return {
    success: true,
    data: { product },
  };
}

/**
 * Get product by ID (admin)
 */
async function GetProductById({ productId }) {
  const product = await Product.findById(productId)
    .populate("thumbnailImage")
    .populate("galleryImages");

  if (!product) {
    return {
      success: false,
      message: "Product not found",
    };
  }

  return {
    success: true,
    data: {
      product,
    },
  };
}

/**
 * List products (admin)
 */
async function ListProducts({
  page = 1,
  pageSize = 20,
  filters = {},
  search,
} = {}) {
  const query = {};

  if (filters.status) query.status = filters.status;
  if (filters.category) query.category = filters.category;

  if (search) {
    const rx = new RegExp(search, "i");
    query.$or = [{ name: rx }, { description: rx }, { slug: rx }];
  }

  const skip = (page - 1) * pageSize;

  const [total, products] = await Promise.all([
    Product.countDocuments(query),
    Product.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate("thumbnailImage")
      .populate("galleryImages")
      .lean(),
  ]);

  if (!products.length) {
    return {
      success: true,
      data: { products: [] },
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  const productIds = products.map((p) => p._id);

  const variants = await Variant.find({ product: { $in: productIds } }).lean();

  const variantsByProduct = variants.reduce((acc, v) => {
    acc[v.product] ??= [];
    acc[v.product].push(v);
    return acc;
  }, {});

  const productsWithVariants = products.map((product) => ({
    ...product,
    variants: variantsByProduct[product._id] || [],
  }));

  return {
    success: true,
    data: { products: productsWithVariants },
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Update product
 */
async function UpdateProduct({ productId, body, userId }) {
  const product = await Product.findById(productId);
  if (!product) {
    return {
      success: false,
      message: "Product not found",
    };
  }

  // Handle name / slug change
  if (body.name && body.name !== product.name) {
    const newSlug = slugify(body.name, { lower: true, strict: true });

    const exists = await Product.findOne({
      slug: newSlug,
      _id: { $ne: productId },
    });

    if (exists) {
      return {
        success: false,
        statusCode: 409,
        message: "Another product already uses this name",
      };
    }

    product.name = body.name;
    product.slug = newSlug;
  }

  // Replace thumbnail if new base64 provided
  if (body.thumbnailImage?.startsWith("data:")) {
    const tmp = await base64ToTempFile(body.thumbnailImage);

    const uploaded = await uploadAndCreateFile({
      ...tmp,
      uploadedBy: userId,
      folder: "litwebs/products/thumbnails",
    });

    if (uploaded.success) {
      product.thumbnailImage = uploaded.data._id;
    }
  }

  // Append new gallery images
  if (Array.isArray(body.galleryImages)) {
    for (const img of body.galleryImages) {
      if (!img?.startsWith("data:")) continue;

      const tmp = await base64ToTempFile(img);

      const uploaded = await uploadAndCreateFile({
        ...tmp,
        uploadedBy: userId,
        folder: "litwebs/products/gallery",
      });

      if (uploaded.success) {
        product.galleryImages.push(uploaded.data._id);
      }
    }
  }

  // Prevent slug override
  const { slug, thumbnailImage, galleryImages, ...safeBody } = body;
  Object.assign(product, safeBody);

  await product.save();

  return {
    success: true,
    data: { product },
  };
}

/**
 * Archive product (soft delete)
 */
async function DeleteProduct({ productId }) {
  const product = await Product.findById(productId);
  if (!product) {
    return {
      success: false,
      message: "Product not found",
    };
  }

  product.status = "archived";
  await product.save();

  return {
    success: true,
    data: { product },
  };
}

module.exports = {
  CreateProduct,
  GetProductById,
  ListProducts,
  UpdateProduct,
  DeleteProduct,
};
