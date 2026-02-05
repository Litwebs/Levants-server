// src/models/role.model.js
const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    // Permission keys: e.g. "orders.create", "products.read"
    permissions: {
      type: [String],
      default: [],
      index: true,
    },

    // Protect system roles (admin, manager, etc.)
    isSystem: {
      type: Boolean,
      default: false,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
// NOTE: keep indexes defined once. `name` is indexed via `unique: true`.
// `permissions` is indexed via `index: true` on the field.

// Convenience helpers
roleSchema.methods.hasPermission = function (permission) {
  if (this.permissions.includes("*")) return true;
  return this.permissions.includes(permission);
};

roleSchema.methods.hasAnyPermission = function (permissions = []) {
  if (this.permissions.includes("*")) return true;
  return permissions.some((p) => this.permissions.includes(p));
};

roleSchema.methods.hasAllPermissions = function (permissions = []) {
  if (this.permissions.includes("*")) return true;
  return permissions.every((p) => this.permissions.includes(p));
};

module.exports = mongoose.model("Role", roleSchema);
