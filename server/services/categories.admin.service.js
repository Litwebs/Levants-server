const Category = require("../models/category.model");
const base64ToTempFile = require("../utils/base64ToTempFile.util");
const { uploadAndCreateFile } = require("./files.service");

/**
 * Upload a base64 image and return the File document _id, or return an
 * existing ObjectId string as-is.
 */
async function resolveImage(imageValue, userId, folder) {
  if (!imageValue) return null;
  if (typeof imageValue === "string" && imageValue.startsWith("data:")) {
    const tmp = await base64ToTempFile(imageValue);
    const result = await uploadAndCreateFile({
      ...tmp,
      uploadedBy: userId,
      folder,
    });
    if (!result.success) return { error: "Failed to upload category image" };
    return result.data._id;
  }
  // Already an ObjectId string
  return imageValue;
}

async function ListCategories({ page = 1, pageSize = 50 }) {
  const skip = (page - 1) * pageSize;

  const [categories, total] = await Promise.all([
    Category.find()
      .populate("image")
      .sort({ title: 1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    Category.countDocuments(),
  ]);

  const totalPages = Math.ceil(total / pageSize) || 1;

  return {
    success: true,
    data: { categories },
    meta: { total, page, pageSize, totalPages },
  };
}

async function CreateCategory({ body, userId }) {
  const existing = await Category.findOne({
    title: { $regex: new RegExp(`^${body.title.trim()}$`, "i") },
  }).lean();

  if (existing) {
    return {
      success: false,
      statusCode: 409,
      message: "A category with this title already exists",
    };
  }

  let imageId = null;
  if (body.image) {
    const resolved = await resolveImage(
      body.image,
      userId,
      "litwebs/categories",
    );
    if (resolved?.error)
      return { success: false, statusCode: 500, message: resolved.error };
    imageId = resolved;
  }

  const category = await Category.create({
    title: body.title.trim(),
    subtitle: body.subtitle || "",
    image: imageId,
    createdBy: userId,
  });

  const populated = await Category.findById(category._id)
    .populate("image")
    .lean();

  return { success: true, data: { category: populated } };
}

async function UpdateCategory({ categoryId, body }) {
  const existing = await Category.findById(categoryId);
  if (!existing) {
    return { success: false, statusCode: 404, message: "Category not found" };
  }

  // Check title uniqueness if changing
  if (
    body.title &&
    body.title.trim().toLowerCase() !== existing.title.toLowerCase()
  ) {
    const conflict = await Category.findOne({
      _id: { $ne: categoryId },
      title: { $regex: new RegExp(`^${body.title.trim()}$`, "i") },
    }).lean();

    if (conflict) {
      return {
        success: false,
        statusCode: 409,
        message: "A category with this title already exists",
      };
    }
  }

  const updates = {};
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.subtitle !== undefined) updates.subtitle = body.subtitle;
  if ("image" in body) {
    if (body.image === null || body.image === "") {
      updates.image = null;
    } else {
      const resolved = await resolveImage(
        body.image,
        existing.createdBy,
        "litwebs/categories",
      );
      if (resolved?.error)
        return { success: false, statusCode: 500, message: resolved.error };
      updates.image = resolved;
    }
  }

  const updated = await Category.findByIdAndUpdate(
    categoryId,
    { $set: updates },
    { new: true },
  )
    .populate("image")
    .lean();

  return { success: true, data: { category: updated } };
}

async function DeleteCategory({ categoryId }) {
  const deleted = await Category.findByIdAndDelete(categoryId);
  if (!deleted) {
    return { success: false, statusCode: 404, message: "Category not found" };
  }
  return { success: true, data: { category: deleted } };
}

async function GetPublicCategories() {
  const categories = await Category.find()
    .populate("image")
    .sort({ title: 1 })
    .lean();

  return { success: true, data: { categories } };
}

module.exports = {
  ListCategories,
  CreateCategory,
  UpdateCategory,
  DeleteCategory,
  GetPublicCategories,
};
