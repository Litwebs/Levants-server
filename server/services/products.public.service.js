const Product = require("../models/product.model");
const Variant = require("../models/variant.model");

function parseCommaSeparatedList(value) {
  if (!value) return null;

  // Support both `?category=a,b` and repeated params like `?category=a&category=b`
  const raw = Array.isArray(value) ? value.join(",") : String(value);

  const items = raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  return items.length ? items : null;
}

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

  const categoryList = parseCommaSeparatedList(category);
  if (categoryList) {
    productFilter.category =
      categoryList.length === 1 ? categoryList[0] : { $in: categoryList };
  }

  if (search) {
    productFilter.$or = [
      { name: new RegExp(search, "i") },
      { description: new RegExp(search, "i") },
    ];
  }

  let productSort = { createdAt: -1 };
  if (sort === "name_asc") productSort = { name: 1 };
  if (sort === "name_desc") productSort = { name: -1 };

  const [categories, products] = await Promise.all([
    // Return all categories for active products (not limited by current
    // `category` filter/search/pagination).
    Product.distinct("category", { status: "active" }),
    Product.find(productFilter)
      .populate("thumbnailImage")
      .populate("galleryImages")
      .select(
        "name slug category description allergens storageNotes thumbnailImage galleryImages createdAt",
      )
      .sort(productSort)
      .lean(),
  ]);

  const allCategories = Array.isArray(categories)
    ? categories.filter(Boolean).sort()
    : [];

  if (products.length === 0) {
    return {
      items: [],
      meta: {
        page,
        pageSize,
        total: 0,
        totalPages: 0,
        categories: allCategories,
      },
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
        allergens: product.allergens,
        storageNotes: product.storageNotes,
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
      categories: allCategories,
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
    .select(
      "name slug category description allergens storageNotes thumbnailImage galleryImages",
    )
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
    allergens: product.allergens,
    storageNotes: product.storageNotes,
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
