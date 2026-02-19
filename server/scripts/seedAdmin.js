// scripts/seedAdmin.js
// Seeds one or more admin users safely (idempotent upsert).
//
// Usage:
//   node scripts/seedAdmin.js
//
// Env required:
//   MONGODB_URI=...
//
// Optional env:
//   SEED_ADMINS_JSON='[{"name":"Hesam","email":"admin@litwebs.co.uk","password":"ChangeMe123!"}]'
//   ADMIN_EMAIL=admin@example.com
//   ADMIN_PASSWORD=ChangeMe123!
//   ADMIN_NAME="Admin"

require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../models/user.model");

const must = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required env: ${k}`);
  return v;
};

const getAdminsToSeed = () => {
  // Preferred: seed multiple admins via JSON env var
  if (process.env.SEED_ADMINS_JSON) {
    try {
      const parsed = JSON.parse(process.env.SEED_ADMINS_JSON);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("SEED_ADMINS_JSON must be a non-empty array");
      }
      return parsed.map((a) => ({
        name: String(a.name || "").trim(),
        email: String(a.email || "")
          .trim()
          .toLowerCase(),
        password: String(a.password || ""),
      }));
    } catch (e) {
      throw new Error(`Invalid SEED_ADMINS_JSON: ${e.message}`);
    }
  }

  // Fallback: single admin via ADMIN_* env vars
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const name = (process.env.ADMIN_NAME || "Admin").trim();

  if (!email || !password) {
    throw new Error(
      "Provide either SEED_ADMINS_JSON or ADMIN_EMAIL + ADMIN_PASSWORD",
    );
  }

  return [{ name, email, password }];
};

const main = async () => {
  const uri = must("MONGO_URI");

  const admins = getAdminsToSeed();

  // basic validation
  for (const a of admins) {
    if (!a.name) throw new Error("Admin name is required");
    if (!a.email || !a.email.includes("@"))
      throw new Error(`Invalid admin email: ${a.email}`);
    if (a.password.length < 8)
      throw new Error(
        `Password too short for ${a.email}. Use at least 8 characters.`,
      );
  }

  await mongoose.connect(uri);

  const results = [];

  for (const a of admins) {
    const passwordHash = await bcrypt.hash(a.password, 12);

    // idempotent: update if exists, create otherwise
    const user = await User.findOneAndUpdate(
      { email: a.email },
      {
        $set: {
          name: a.name,
          email: a.email,
          passwordHash,
          role: "admin",
          status: "active",
          // optional: ensure defaults
          preferences: { theme: "system", language: "en-GB" },
        },
        $unset: {
          pendingEmail: "",
          pendingEmailTokenHash: "",
          pendingEmailTokenExpiresAt: "",
          twoFactorLogin: "",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    results.push({ id: String(user._id), email: user.email, role: user.role });
  }

  console.log("✅ Seeded admins:", results);

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error("❌ seed-admin failed:", err.message);
  process.exitCode = 1;
});
