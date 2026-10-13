const Product = require("../models/product.model");
const Variant = require("../models/variant.model");

async function SearchVariants({
  q,
  page = 1,
  pageSize = 20,
  inStock = false,
  stock = "all",
  category = "",
  sort = "newest",
  browse = false,
  limit,
} = {}) {
  const queryText = String(q || "").trim();
  if (!browse && !queryText) return { success: true, data: { variants: [] } };
  const safePage = Math.max(Number(page) || 1, 1);
  const safePageSize = Math.min(Math.max(Number(limit ?? pageSize) || 20, 1), 50);
  const categoryFilter = String(category || "").trim();
  const stockFilter = String(stock || "all").trim();
  const legacyInStock = inStock === true || String(inStock).toLowerCase() === "true";
  const rx = queryText
    ? new RegExp(queryText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    : null;

  // Match by variant name/sku OR product name/slug/category
  const products = rx
    ? await Product.find({
        $or: [{ name: rx }, { slug: rx }, { category: rx }],
      })
        .select("_id")
        .limit(200)
        .lean()
    : [];
  const productIds = products.map((p) => p._id);

  const variantQuery = {
    status: { $ne: "archived" },
    ...(rx
      ? {
          $or: [
            { name: rx },
            { sku: rx },
            ...(productIds.length > 0 ? [{ product: { $in: productIds } }] : []),
          ],
        }
      : {}),
    ...(legacyInStock || stockFilter === "in_stock"
      ? { $expr: { $gt: [{ $subtract: [{ $ifNull: ["$stockQuantity", 0] }, { $ifNull: ["$reservedQuantity", 0] }] }, 0] } }
      : stockFilter === "out_of_stock"
        ? { $expr: { $lte: [{ $subtract: [{ $ifNull: ["$stockQuantity", 0] }, { $ifNull: ["$reservedQuantity", 0] }] }, 0] } }
        : stockFilter === "low_stock"
          ? {
              $expr: {
                $and: [
                  { $gt: [{ $subtract: [{ $ifNull: ["$stockQuantity", 0] }, { $ifNull: ["$reservedQuantity", 0] }] }, 0] },
                  { $lte: [{ $subtract: [{ $ifNull: ["$stockQuantity", 0] }, { $ifNull: ["$reservedQuantity", 0] }] }, 5] },
                ],
              },
            }
      : {}),
  };

  if (browse) {
    const activeProducts = await Product.find({
      status: "active",
      ...(categoryFilter ? { category: categoryFilter } : {}),
    })
      .select("_id")
      .lean();
    variantQuery.status = "active";
    variantQuery.product = { $in: activeProducts.map((product) => product._id) };
  }

  const sortOptions = {
    newest: { createdAt: -1 },
    name_asc: { name: 1, createdAt: -1 },
    price_asc: { price: 1, createdAt: -1 },
    price_desc: { price: -1, createdAt: -1 },
    stock_desc: { stockQuantity: -1, createdAt: -1 },
  };
  const variantSort = sortOptions[sort] || sortOptions.newest;

  const [total, variants, categories] = await Promise.all([
    Variant.countDocuments(variantQuery),
    Variant.find(variantQuery)
    .select(
      "name sku price product status stockQuantity reservedQuantity thumbnailImage",
    )
    .populate({ path: "thumbnailImage", select: "url" })
    .populate({
      path: "product",
      select: "name category status thumbnailImage",
      populate: { path: "thumbnailImage", select: "url" },
    })
    .sort(variantSort)
    .skip((safePage - 1) * safePageSize)
    .limit(safePageSize)
    .lean(),
    Product.distinct("category", { status: "active", category: { $ne: "" } }),
  ]);

  const shaped = variants.map((v) => ({
    _id: String(v._id),
    name: v.name,
    sku: v.sku,
    price: typeof v.price === "number" ? v.price : undefined,
    status: v.status,
    stockQuantity: Number(v.stockQuantity || 0),
    reservedQuantity: Number(v.reservedQuantity || 0),
    availableQuantity: Math.max(
      0,
      Number(v.stockQuantity || 0) - Number(v.reservedQuantity || 0),
    ),
    thumbnailImage: v.thumbnailImage || null,
    product:
      v.product && typeof v.product === "object"
        ? {
            name: v.product.name,
            category: v.product.category,
            status: v.product.status,
            thumbnailImage: v.product.thumbnailImage || null,
          }
        : null,
  }));

  return {
    success: true,
    data: {
      variants: shaped,
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / safePageSize)),
      },
      filters: {
        categories: categories.filter(Boolean).sort((a, b) => a.localeCompare(b)),
      },
    },
  };
}

module.exports = { SearchVariants };
