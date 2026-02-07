// src/services/productVariants.admin.service.js
const Product = require("../models/product.model");
const Variant = require("../models/variant.model");

/**
 * Create variant
 */
async function CreateVariant({ productId, body, userId }) {
  const product = await Product.findById(productId);
  if (!product) {
    return { success: false, message: "Product not found" };
  }

  const variant = await Variant.create({
    ...body,
    product: productId,
    createdBy: userId,
  });

  return { success: true, data: { variant } };
}

/**
 * List variants for product
 */
async function ListVariants({ productId }) {
  const variants = await Variant.find({ product: productId }).sort({
    createdAt: -1,
  });

  return { success: true, data: { variants } };
}

/**
 * Update variant
 */
async function UpdateVariant({ variantId, body }) {
  const variant = await Variant.findByIdAndUpdate(
    variantId,
    { $set: body },
    { new: true, runValidators: true },
  );

  if (!variant) {
    return { success: false, message: "Variant not found" };
  }

  return { success: true, data: { variant } };
}

/**
 * Delete variant
 */
async function DeleteVariant({ variantId }) {
  const variant = await Variant.findByIdAndUpdate(
    variantId,
    { $set: { status: "inactive" } },
    { new: true, runValidators: true },
  );

  if (!variant) return { success: false, message: "Variant not found" };

  return { success: true };
}

module.exports = {
  CreateVariant,
  ListVariants,
  UpdateVariant,
  DeleteVariant,
};
