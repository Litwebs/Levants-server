// src/controllers/productVariants.admin.controller.js
const service = require("../services/variants.admin.service");
const { sendCreated, sendOk, sendErr } = require("../utils/response.util");

const CreateVariant = async (req, res) => {
  const result = await service.CreateVariant({
    productId: req.params.productId,
    body: req.body,
    userId: req.user.id,
  });

  if (!result.success) {
    return sendErr(res, { statusCode: 404, message: result.message });
  }

  return sendCreated(res, result.data);
};

const ListVariants = async (req, res) => {
  const result = await service.ListVariants({
    productId: req.params.productId,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 404,
      message: result.message,
    });
  }

  return sendOk(res, result.data);
};

const UpdateVariant = async (req, res) => {
  const result = await service.UpdateVariant({
    variantId: req.params.variantId,
    body: req.body,
  });

  if (!result.success) {
    return sendErr(res, { statusCode: 404, message: result.message });
  }

  return sendOk(res, result.data);
};

const DeleteVariant = async (req, res) => {
  const result = await service.DeleteVariant({
    variantId: req.params.variantId,
  });

  if (!result.success) {
    return sendErr(res, { statusCode: 404, message: result.message });
  }

  return sendOk(res, { deleted: true });
};

module.exports = {
  CreateVariant,
  ListVariants,
  UpdateVariant,
  DeleteVariant,
};
