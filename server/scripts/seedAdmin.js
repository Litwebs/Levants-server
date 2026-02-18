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

require("dotenv").config();

const mongoose = require("mongoose");
const BusinessInfo = require("../models/businessInfo.model");

const must = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required env: ${k}`);
  return v;
};

const getBusinessInfoToSeed = () => {
  const companyName = (process.env.BUSINESS_NAME || "My Business").trim();
  const email = (process.env.BUSINESS_EMAIL || "").trim().toLowerCase();
  const phone = (process.env.BUSINESS_PHONE || "").trim();
  const address = (process.env.BUSINESS_ADDRESS || "").trim();

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

const main = async () => {
  const uri = must("MONGO_URI");
  const business = getBusinessInfoToSeed();

  await mongoose.connect(uri);

  // ✅ Single-document upsert (business info is global)
  const doc = await BusinessInfo.findOneAndUpdate(
    {},
    {
      $set: {
        companyName: business.companyName,
        email: business.email,
        phone: business.phone,
        address: business.address,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  console.log("✅ Seeded business info:", {
    id: String(doc._id),
    companyName: doc.companyName,
    email: doc.email,
  });

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error("❌ seed-business-info failed:", err.message);
  process.exitCode = 1;
});
