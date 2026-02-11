// src/controllers/products.admin.controller.js
const productService = require("../services/products.admin.service");
const { sendCreated, sendOk, sendErr } = require("../utils/response.util");

/**
 * CREATE
 */
const CreateProduct = async (req, res) => {
  const result = await productService.CreateProduct({
    body: req.body,
    userId: req.user?._id || req.user?.id,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message,
    });
  }

  return sendCreated(res, result.data);
};

/**
 * GET BY ID
 */
const GetProduct = async (req, res) => {
  const result = await productService.GetProductById({
    productId: req.params.productId,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: 404,
      message: result.message,
    });
  }

  return sendOk(res, result.data);
};

/**
 * LIST
 */
const ListProducts = async (req, res) => {
  const result = await productService.ListProducts({
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
    search: req.query.search,
    filters: {
      status: req.query.status,
      category: req.query.category,
    },
  });

  return sendOk(res, result.data, { meta: result.meta });
};

/**
 * UPDATE
 */
const UpdateProduct = async (req, res) => {
  const result = await productService.UpdateProduct({
    productId: req.params.productId,
    body: req.body,
    userId: req.user?._id || req.user?.id,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: 404,
      message: result.message,
    });
  }

  return sendOk(res, result.data);
};

/**
 * DELETE (archive)
 */
const DeleteProduct = async (req, res) => {
  const result = await productService.DeleteProduct({
    productId: req.params.productId,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: 404,
      message: result.message,
    });
  }

  return sendOk(res, result.data);
};

module.exports = {
  CreateProduct,
  GetProduct,
  ListProducts,
  UpdateProduct,
  DeleteProduct,
};
