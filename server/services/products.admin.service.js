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
 * Get product by ID (admin)
 */
async function GetProductById({ productId }) {
  const product = await Product.findById(productId);
  if (!product) {
    return {
      success: false,
      message: "Product not found",
    };
  }

  const variants = await Variant.find({ product: productId }).sort({
    createdAt: -1,
  });

  return {
    success: true,
    data: {
      product,
      variants,
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
      .lean(),
  ]);

  if (products.length === 0) {
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
async function UpdateProduct({ productId, body }) {
  const product = await Product.findById(productId);
  if (!product) {
    return {
      success: false,
      message: "Product not found",
    };
  }

  // If name changes → regenerate slug safely
  if (body.name && body.name !== product.name) {
    const newSlug = slugify(body.name, { lower: true, strict: true });

    const slugExists = await Product.findOne({
      slug: newSlug,
      _id: { $ne: productId },
    });

    if (slugExists) {
      return {
        success: false,
        statusCode: 409,
        message: "Another product already uses this name",
      };
    }

    product.slug = newSlug;
    product.name = body.name;
  }

  // Prevent direct slug overwrite
  const { slug, ...safeBody } = body;

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
