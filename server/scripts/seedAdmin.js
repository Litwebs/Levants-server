// scripts/seedAdmin.js
// Seeds one or more admin users safely (idempotent upsert).

require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../models/user.model");
const Role = require("../models/role.model"); // ✅ ADD

const must = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required env: ${k}`);
  return v;
};

const getAdminsToSeed = () => {
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

  for (const a of admins) {
    if (!a.name) throw new Error("Admin name is required");
    if (!a.email || !a.email.includes("@")) {
      throw new Error(`Invalid admin email: ${a.email}`);
    }
    if (a.password.length < 8) {
      throw new Error(
        `Password too short for ${a.email}. Use at least 8 characters.`,
      );
    }
  }

  await mongoose.connect(uri);

  // ✅ Fetch admin role (must exist)
  const adminRole = await Role.findOne({ name: "admin" });
  if (!adminRole) {
    throw new Error(
      "Admin role not found. Make sure seedDefaultRoles has run first.",
    );
  }

  const results = [];

  for (const a of admins) {
    const passwordHash = await bcrypt.hash(a.password, 12);

    const user = await User.findOneAndUpdate(
      { email: a.email },
      {
        $set: {
          name: a.name,
          email: a.email,
          passwordHash,
          role: adminRole._id, // ✅ FIX
          status: "active",
          preferences: { theme: "system", language: "en-GB" },
        },
        $unset: {
          pendingEmail: "",
          pendingEmailTokenHash: "",
          pendingEmailTokenExpiresAt: "",
          twoFactorLogin: "",
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    results.push({
      id: String(user._id),
      email: user.email,
      role: "admin",
    });
  }

  console.log("✅ Seeded admins:", results);

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error("❌ seed-admin failed:", err.message);
  process.exitCode = 1;
});
