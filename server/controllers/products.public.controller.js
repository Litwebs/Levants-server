const productService = require("../services/products.public.service");
const { sendOk, sendErr } = require("../utils/response.util");

/**
 * LIST (public)
 */
const ListActiveProducts = async (req, res) => {
  const {
    page,
    pageSize,
    category,
    minPrice,
    maxPrice,
    inStock,
    search,
    sort,
  } = req.query;

  const result = await productService.listProducts({
    page: Number(page) || 1,
    pageSize: Number(pageSize) || 12,
    category,
    minPrice: minPrice !== undefined ? Number(minPrice) : undefined,
    maxPrice: maxPrice !== undefined ? Number(maxPrice) : undefined,
    inStock: inStock === "true",
    search,
    sort,
  });

  return sendOk(res, result.items, { meta: result.meta });
};

/**
 * GET (public)
 */
const GetActiveProduct = async (req, res) => {
  const product = await productService.getProductById({
    productId: req.params.productId,
  });

  if (!product) {
    return sendErr(res, {
      statusCode: 404,
      message: "Product not found",
    });
  }

  return sendOk(res, product);
};

module.exports = {
  ListActiveProducts,
  GetActiveProduct,
};
