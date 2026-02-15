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
    .populate("thumbnailImage")
    .populate("galleryImages")
    .select(
      "name slug category description thumbnailImage galleryImages createdAt",
    )
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
    .select("product name price stockQuantity lowStockAlert")
    .lean();

  const variantsByProduct = variants.reduce((acc, v) => {
    acc[v.product] ??= [];
    acc[v.product].push({
      id: v._id,
      name: v.name,
      price: v.price,
      currency: "gbp",
      stockQuantity: v.stockQuantity,
      lowStock: v.stockQuantity <= v.lowStockAlert,
    });
    return acc;
  }, {});

  let items = products
    .map((product) => {
      const productVariants = variantsByProduct[product._id] || [];
      if (productVariants.length === 0) return null;

      const prices = productVariants.map((v) => v.price);

      return {
        id: product._id,
        name: product.name,
        slug: product.slug,
        category: product.category,
        description: product.description,
        thumbnailImage: product.thumbnailImage,
        galleryImages: product.galleryImages,
        variants: productVariants,
        pricing: {
          min: Math.min(...prices),
          max: Math.max(...prices),
          currency: "gbp",
        },
      };
    })
    .filter(Boolean);

  if (sort === "price_asc") items.sort((a, b) => a.pricing.min - b.pricing.min);
  if (sort === "price_desc")
    items.sort((a, b) => b.pricing.min - a.pricing.min);

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
    .populate("thumbnailImage")
    .populate("galleryImages")
    .select("name slug category description thumbnailImage galleryImages")
    .lean();

  if (!product) return null;

  const variants = await Variant.find({
    product: productId,
    status: "active",
  })
    .populate("thumbnailImage")
    .select("name price stockQuantity lowStockAlert")
    .lean();

  if (variants.length === 0) return null;

  return {
    id: product._id,
    name: product.name,
    slug: product.slug,
    category: product.category,
    description: product.description,
    thumbnailImage: product.thumbnailImage,
    galleryImages: product.galleryImages,
    variants: variants.map((v) => ({
      id: v._id,
      name: v.name,
      price: v.price,
      currency: "gbp",
      stockQuantity: v.stockQuantity,
      lowStock: v.stockQuantity <= v.lowStockAlert,
      thumbnailImage: v.thumbnailImage,
    })),
  };
}

module.exports = {
  listProducts,
  getProductById,
};
