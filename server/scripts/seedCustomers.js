// scripts/seedCustomers.js
// HARD RESET + seed customers ONLY (STRICT SAFE)

require("dotenv").config();
const mongoose = require("mongoose");

const Customer = require("../models/customer.model");
// Optional (OFF by default). Only enable if you want to avoid orphan orders.
// const Order = require("../models/order.model");

const must = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
};

// ----------------------------
// CONFIG
// ----------------------------
const CUSTOMER_COUNT = 12;

// If you have orders referencing customers, deleting customers will leave orphan orders.
// Set true ONLY if you want to clear orders as well.
// const ALSO_CLEAR_ORDERS = false;

// ----------------------------
// HELPERS
// ----------------------------
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

  console.log("🧨 Clearing existing customers...");
  // If you want to be extra safe and only remove seeded ones, swap to:
  // await Customer.deleteMany({ "metadata.seeded": true });
  await Customer.deleteMany({});

  // Optional:
  // if (ALSO_CLEAR_ORDERS) {
  //   console.log("🧨 Clearing existing orders (optional)...");
  //   await Order.deleteMany({});
  // }

  console.log(`👤 Seeding ${CUSTOMER_COUNT} customers...`);

  const customers = Array.from({ length: CUSTOMER_COUNT }, (_, i) => ({
    email: `seed.customer${i + 1}@test.com`,
    firstName: `Customer${i + 1}`,
    lastName: "Seeded",
    phone: `07123456${String(100 + i)}`, // keeps it as a string
    isGuest: true,
    addresses: [generateAddress(i)],
    // If your schema supports metadata, keeping this is handy:
    metadata: { seeded: true },
    // lastOrderAt intentionally omitted (no orders are being created now)
  }));

  // insertMany is much faster than Customer.create in a loop
  await Customer.insertMany(customers);

  console.log("✅ Customers seeded successfully");
  console.log(`👤 Customers: ${CUSTOMER_COUNT}`);

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error("❌ Seeding failed:", err.message);
  process.exit(1);
});
