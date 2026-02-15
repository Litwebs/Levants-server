// scripts/seedBusinessInfo.js
// Seeds business info safely (idempotent upsert).
//
// Usage:
//   node scripts/seedBusinessInfo.js
//
// Env required:
//   MONGO_URI=...
//
// Optional env:
//   BUSINESS_NAME="Levants Dairy Farm"
//   BUSINESS_EMAIL="info@levantsdairy.com"
//   BUSINESS_PHONE="+1 (555) 123-4567"
//   BUSINESS_ADDRESS="123 Farm Road, Countryside"

const mongoose = require("mongoose");
const BusinessInfo = require("../models/businessInfo.model");

const must = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required env: ${k}`);
  return v;
};

const getBusinessInfoToSeed = () => {
  const companyName = (process.env.BUSINESS_NAME || "My Business").trim();
  const email = (process.env.BUSINESS_EMAIL || "info@example.com")
    .trim()
    .toLowerCase();
  const phone = (process.env.BUSINESS_PHONE || "12345678900").trim();
  const address = (process.env.BUSINESS_ADDRESS || "ADDRESS_POINT").trim();

  if (!email || !email.includes("@")) {
    throw new Error(
      "BUSINESS_EMAIL is required and must be a valid email address",
    );
  }

  if (!companyName) {
    throw new Error("BUSINESS_NAME is required");
  }

  return {
    companyName,
    email,
    phone: phone || null,
    address: address || null,
  };
};

const seedBusinessInfo = async () => {
  const business = getBusinessInfoToSeed();

  const singletonKey = "business-info";

  // ✅ Single-document upsert (business info is global)
  const doc = await BusinessInfo.findOneAndUpdate(
    { singletonKey },
    {
      $set: {
        companyName: business.companyName,
        email: business.email,
        phone: business.phone,
        address: business.address,
      },
      $setOnInsert: {
        singletonKey,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  return doc;
};

const main = async () => {
  const uri = must("MONGO_URI");
  await mongoose.connect(uri);

  const doc = await seedBusinessInfo();

  console.log("✅ Seeded business info:", {
    id: String(doc._id),
    companyName: doc.companyName,
    email: doc.email,
  });

  await mongoose.disconnect();
};

// Run as CLI if executed directly
if (require.main === module) {
  main().catch((err) => {
    console.error("❌ seed-business-info failed:", err.message);
    process.exitCode = 1;
  });
}

module.exports = { seedBusinessInfo };
