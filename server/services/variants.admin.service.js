const Product = require("../models/product.model");
const Variant = require("../models/variant.model");
const stripeService = require("./stripe.service");

/**
 * Create variant (Stripe-integrated)
 */
async function CreateVariant({ productId, body, userId }) {
  const product = await Product.findById(productId);
  if (!product) {
    return { success: false, message: "Product not found" };
  }

  // 1️⃣ Create Stripe Product
  const { stripeProductId } = await stripeService.createStripeProduct({
    name: `${product.name} - ${body.name}`,
    metadata: {
      productId: productId.toString(),
      variantName: body.name,
    },
  });

  // 2️⃣ Create Stripe Price
  const { stripePriceId } = await stripeService.createStripePrice({
    stripeProductId,
    amount: body.price,
  });

  // 3️⃣ Persist variant
  const variant = await Variant.create({
    ...body,
    product: productId,
    createdBy: userId,
    stripeProductId,
    stripePriceId,
  });

  return { success: true, data: { variant } };
}

/**
 * List variants for product
 */
async function ListVariants({ productId }) {
  const product = await Product.findById(productId);
  if (!product) {
    return { success: false, statusCode: 404, message: "Product not found" };
  }

  const variants = await Variant.find({
    product: productId,
    status: "active",
  }).sort({
    createdAt: -1,
  });

  return { success: true, data: { variants } };
}

/**
 * Update variant
 * - If price changes → create NEW Stripe price
 */
async function UpdateVariant({ variantId, body }) {
  const variant = await Variant.findById(variantId);
  if (!variant) {
    return { success: false, message: "Variant not found" };
  }

  // 🔁 Handle price change correctly
  if (body.price !== undefined && body.price !== variant.price) {
    const { stripePriceId } = await stripeService.createStripePrice({
      stripeProductId: variant.stripeProductId,
      amount: body.price,
    });

    variant.stripePriceId = stripePriceId;
    variant.price = body.price;
  }

  // Normal updates
  if (body.name !== undefined) variant.name = body.name;
  if (body.stockQuantity !== undefined)
    variant.stockQuantity = body.stockQuantity;
  if (body.lowStockAlert !== undefined)
    variant.lowStockAlert = body.lowStockAlert;
  if (body.status !== undefined) variant.status = body.status;

  await variant.save();

  return { success: true, data: { variant } };
}

/**
 * Disable variant (soft delete)
 */
async function DeleteVariant({ variantId }) {
  const variant = await Variant.findById(variantId);
  if (!variant) {
    return { success: false, message: "Variant not found" };
  }

  // Archive Stripe product
  await stripeService.archiveStripeProduct(variant.stripeProductId);

  variant.status = "inactive";
  await variant.save();

  return { success: true };
}

module.exports = {
  CreateVariant,
  ListVariants,
  UpdateVariant,
  DeleteVariant,
};
