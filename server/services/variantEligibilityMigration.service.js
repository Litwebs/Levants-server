const Product = require("../models/product.model");
const Variant = require("../models/variant.model");

// Copy the retired product setting only for pre-existing variants without their
// own flag. Raw collections avoid Mongoose defaults masking missing fields.
// Explicit variant choices are never overwritten, including on later restarts.
async function migrateVariantEligibility() {
  const excluded = await Product.collection.find(
    { isSubscriptionEligible: false }, { projection: { _id: 1 } },
  ).toArray();
  if (excluded.length) await Variant.collection.updateMany({
    isSubscriptionEligible: { $exists: false },
    product: { $in: excluded.map(product => product._id) },
  }, { $set: { isSubscriptionEligible: false } });
  await Variant.collection.updateMany(
    { isSubscriptionEligible: { $exists: false } },
    { $set: { isSubscriptionEligible: true } },
  );
}

module.exports = { migrateVariantEligibility };
