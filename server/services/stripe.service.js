// src/services/stripe.service.js

const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

/**
 * Create a Stripe Product for a variant
 */
async function createStripeProduct({ name, metadata = {} }) {
  const product = await stripe.products.create({
    name,
    active: true,
    metadata,
  });

  return {
    stripeProductId: product.id,
  };
}

/**
 * Create a Stripe Price for a variant
 * NOTE: Prices are immutable in Stripe
 */
async function createStripePrice({
  stripeProductId,
  amount,
  currency = "gbp",
}) {
  const price = await stripe.prices.create({
    product: stripeProductId,
    unit_amount: Math.round(amount * 100), // pounds → pence
    currency,
  });

  return {
    stripePriceId: price.id,
  };
}

/**
 * Archive Stripe Product (soft delete)
 */
async function archiveStripeProduct(stripeProductId) {
  if (!stripeProductId) return;

  await stripe.products.update(stripeProductId, {
    active: false,
  });
}

module.exports = {
  createStripeProduct,
  createStripePrice,
  archiveStripeProduct,
};
