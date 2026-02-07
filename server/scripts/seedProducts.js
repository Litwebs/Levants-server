// scripts/seedProducts.js
// Seeds a large number of products and variants (idempotent)

require("dotenv").config();

const mongoose = require("mongoose");
const slugify = require("slugify");

const Product = require("../models/product.model");
const Variant = require("../models/variant.model");

const must = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required env: ${k}`);
  return v;
};

// ----------------------------
// CONFIG
// ----------------------------
const PRODUCT_COUNT = 5; // 🔥 change this to 100, 500, 1000 safely
const VARIANTS_PER_PRODUCT = 3;

const CATEGORIES = ["Dairy", "Eggs", "Cheese", "Butter"];
const ALLERGENS = ["milk", "eggs"];

// ----------------------------
// GENERATORS
// ----------------------------
const generateProductName = (i) => `Farm Product ${i + 1}`;

const generateVariants = (productIndex) => {
  return Array.from({ length: VARIANTS_PER_PRODUCT }, (_, i) => ({
    name: `Variant ${i + 1}`,
    price: Number((1.99 + i + productIndex * 0.1).toFixed(2)),
    stockQuantity: 50 + i * 20,
    sku: `SKU-P${productIndex + 1}-V${i + 1}`,
  }));
};

// ----------------------------
// MAIN
// ----------------------------
const main = async () => {
  const uri = must("MONGO_URI");
  await mongoose.connect(uri);

  const results = [];

  for (let i = 0; i < PRODUCT_COUNT; i++) {
    const name = generateProductName(i);
    const slug = slugify(name, { lower: true, strict: true });

    const product = await Product.findOneAndUpdate(
      { slug }, // ✅ unique identity
      {
        $set: {
          name,
          slug,
          category: CATEGORIES[i % CATEGORIES.length],
          description: `High quality farm product number ${i + 1}. Freshly produced.`,
          status: "active",
          allergens: ALLERGENS,
          storageNotes: "Keep refrigerated between 2–5°C",
          thumbnailImage: `/images/products/${slug}-thumb.jpg`,
          galleryImages: [],
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    const variants = generateVariants(i);
    const variantResults = [];

    for (const v of variants) {
      const variant = await Variant.findOneAndUpdate(
        { sku: v.sku }, // ✅ unique identity
        {
          $set: {
            product: product._id,
            name: v.name,
            price: v.price,
            stockQuantity: v.stockQuantity,
            status: "active",
            sku: v.sku,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );

      variantResults.push({
        sku: variant.sku,
        price: variant.price,
      });
    }

    results.push({
      product: product.name,
      variants: variantResults.length,
    });
  }

  console.log("✅ Seeded products & variants:", {
    products: results.length,
    variantsPerProduct: VARIANTS_PER_PRODUCT,
  });

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error("❌ seed-products failed:", err.message);
  process.exitCode = 1;
});
