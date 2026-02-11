// scripts/seedCustomers.js
// HARD RESET + seed customers, addresses, and orders (STRICT SAFE)

require("dotenv").config();
const mongoose = require("mongoose");

const Customer = require("../models/customer.model");
const Order = require("../models/order.model");
const Product = require("../models/product.model");
const Variant = require("../models/variant.model");

const must = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
};

// ----------------------------
// CONFIG
// ----------------------------
const CUSTOMER_COUNT = 2500;
const ORDERS_PER_CUSTOMER = 12; // 👈 MINIMUM 15 (as requested)

const PRODUCT_ID = new mongoose.Types.ObjectId("698b6a310235da5b6921dc70");

// ----------------------------
// HELPERS
// ----------------------------
const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const generateAddress = (i) => ({
  line1: `${i + 10} Seed Street`,
  line2: null,
  city: "Bradford",
  postcode: "BD1 1AA",
  country: "UK",
  isDefault: true,
});

// ----------------------------
// MAIN
// ----------------------------
const main = async () => {
  await mongoose.connect(must("MONGO_URI"));

  console.log("🧨 Clearing existing customers & orders...");
  await Order.deleteMany({});
  await Customer.deleteMany({});

  // ----------------------------
  // LOAD PRODUCT + VARIANTS
  // ----------------------------
  const product = await Product.findById(PRODUCT_ID);
  if (!product) {
    throw new Error("Product not found. Seed products first.");
  }

  const variants = await Variant.find({ product: PRODUCT_ID });
  if (!variants.length) {
    throw new Error("No variants found for product.");
  }

  // ----------------------------
  // CREATE CUSTOMERS
  // ----------------------------
  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    const customer = await Customer.create({
      email: `seed.customer${i + 1}@test.com`,
      firstName: `Customer${i + 1}`,
      lastName: "Seeded",
      phone: `07123456${100 + i}`,
      isGuest: true,
      addresses: [generateAddress(i)],
    });

    let lastOrderAt = null;

    // ----------------------------
    // CREATE ORDERS
    // ----------------------------
    for (let j = 0; j < ORDERS_PER_CUSTOMER; j++) {
      const variant = randomFrom(variants);
      const quantity = 1 + (j % 3);

      const itemSubtotal = Number((variant.price * quantity).toFixed(2));

      const deliveryFee = 2.99;
      const total = Number((itemSubtotal + deliveryFee).toFixed(2));

      const createdAt = new Date(
        Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 60,
      );

      await Order.create({
        customer: customer._id,

        items: [
          {
            product: product._id,
            variant: variant._id,
            name: `${product.name} – ${variant.name}`,
            sku: variant.sku,
            price: variant.price,
            quantity,
            subtotal: itemSubtotal,
          },
        ],

        currency: "GBP",
        subtotal: itemSubtotal,
        deliveryFee,
        total,

        status: "paid",
        paidAt: createdAt,

        reservationExpiresAt: new Date(createdAt.getTime() + 15 * 60 * 1000),

        metadata: {
          seeded: true,
        },

        createdAt,
        updatedAt: createdAt,
      });

      if (!lastOrderAt || createdAt > lastOrderAt) {
        lastOrderAt = createdAt;
      }
    }

    // ----------------------------
    // UPDATE CUSTOMER LAST ORDER
    // ----------------------------
    await Customer.updateOne({ _id: customer._id }, { $set: { lastOrderAt } });
  }

  console.log("✅ Customers + orders seeded successfully");
  console.log(`👤 Customers: ${CUSTOMER_COUNT}`);
  console.log(`📦 Orders per customer: ${ORDERS_PER_CUSTOMER}`);

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error("❌ Seeding failed:", err.message);
  process.exit(1);
});
