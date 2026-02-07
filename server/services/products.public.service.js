const Product = require("../models/product.model");
const Variant = require("../models/variant.model");

async function listProducts({
  page = 1,
  pageSize = 12,
  category,
  minPrice,
  maxPrice,
  inStock,
  search,
  sort,
}) {
  const productFilter = { status: "active" };

  if (category) productFilter.category = category;

  if (search) {
    productFilter.$or = [
      { name: new RegExp(search, "i") },
      { description: new RegExp(search, "i") },
    ];
  }

  let productSort = { createdAt: -1 };
  if (sort === "name_asc") productSort = { name: 1 };
  if (sort === "name_desc") productSort = { name: -1 };

  const products = await Product.find(productFilter)
    .select("name category description thumbnailImage galleryImages createdAt")
    .sort(productSort)
    .lean();

  if (products.length === 0) {
    return {
      items: [],
      meta: { page, pageSize, total: 0, totalPages: 0 },
    };
  }

  const productIds = products.map((p) => p._id);

  const variantFilter = {
    product: { $in: productIds },
    status: "active",
  };

  if (inStock) variantFilter.stockQuantity = { $gt: 0 };

  if (minPrice !== undefined || maxPrice !== undefined) {
    variantFilter.price = {};
    if (minPrice !== undefined) variantFilter.price.$gte = minPrice;
    if (maxPrice !== undefined) variantFilter.price.$lte = maxPrice;
  }

  const variants = await Variant.find(variantFilter)
    .select("product name price stockQuantity")
    .lean();

  const variantsByProduct = variants.reduce((acc, v) => {
    acc[v.product] ??= [];
    acc[v.product].push(v);
    return acc;
  }, {});

  let items = products
    .map((product) => {
      const productVariants = variantsByProduct[product._id] || [];
      if (productVariants.length === 0) return null;

      const minVariantPrice = Math.min(...productVariants.map((v) => v.price));

      return {
        ...product,
        variants: productVariants,
        minPrice: minVariantPrice,
      };
    })
    .filter(Boolean);

  if (sort === "price_asc") items.sort((a, b) => a.minPrice - b.minPrice);
  if (sort === "price_desc") items.sort((a, b) => b.minPrice - a.minPrice);

  const total = items.length;
  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

async function getProductById({ productId }) {
  const product = await Product.findOne({
    _id: productId,
    status: "active",
  })
    .select("name category description thumbnailImage galleryImages")
    .lean();

  if (!product) return null;

  const variants = await Variant.find({
    product: productId,
    status: "active",
  })
    .select("name price stockQuantity")
    .lean();

  if (variants.length === 0) return null;

  return {
    ...product,
    variants,
  };
}

module.exports = {
  listProducts,
  getProductById,
};
