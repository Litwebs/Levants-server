// src/services/products.admin.service.js
const Product = require("../models/product.model");
const Variant = require("../models/variant.model");
const slugify = require("slugify");

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

  const product = await Product.create({
    ...body,
    slug,
    createdBy: userId,
  });

  return {
    success: true,
    data: { product },
  };
}

/**
 * Get product by ID
 */
async function GetProductById({ productId }) {
  const product = await Product.findById(productId);

  if (!product) {
    return {
      success: false,
      message: "Product not found",
    };
  }

  const variants = await Variant.find({ product: productId });

  return {
    success: true,
    data: { product, variants },
  };
}

/**
 * List products (admin)
 */
async function ListProducts({ filters }) {
  const query = {};

  if (filters?.status) query.status = filters.status;
  if (filters?.category) query.category = filters.category;

  const products = await Product.find(query).sort({ createdAt: -1 });

  // Get variants for all products
  const productsWithVariants = await Promise.all(
    products.map(async (product) => ({
      ...product.toObject(),
      variants: await Variant.find({ product: product._id }),
    })),
  );

  return {
    success: true,
    data: { products: productsWithVariants },
  };
}

/**
 * Update product
 */
async function UpdateProduct({ productId, body }) {
  const product = await Product.findById(productId);

  if (!product) {
    return {
      success: false,
      message: "Product not found",
    };
  }

  Object.assign(product, body);
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
