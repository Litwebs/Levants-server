const service = require("../services/categories.admin.service");
const { sendOk, sendErr } = require("../utils/response.util");

const ListCategories = async (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 50);

  const result = await service.ListCategories({ page, pageSize });
  return sendOk(res, result.data, { meta: result.meta });
};

const CreateCategory = async (req, res) => {
  const result = await service.CreateCategory({
    body: req.body,
    userId: req.user?._id,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to create category",
    });
  }

  return sendOk(res, result.data);
};

const UpdateCategory = async (req, res) => {
  const result = await service.UpdateCategory({
    categoryId: req.params.categoryId,
    body: req.body,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to update category",
    });
  }

  return sendOk(res, result.data);
};

const DeleteCategory = async (req, res) => {
  const result = await service.DeleteCategory({
    categoryId: req.params.categoryId,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to delete category",
    });
  }

  return sendOk(res, result.data);
};

const GetPublicCategories = async (req, res) => {
  const result = await service.GetPublicCategories();
  return sendOk(res, result.data);
};

module.exports = {
  ListCategories,
  CreateCategory,
  UpdateCategory,
  DeleteCategory,
  GetPublicCategories,
};
