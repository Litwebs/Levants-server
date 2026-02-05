// src/seed/seedDefaultRoles.js

const Role = require("../models/role.model");

const DEFAULT_ROLES = [
  {
    name: "admin",
    description: "Full system access",
    permissions: ["*"],
    isSystem: true,
  },

  {
    name: "manager",
    description: "Manages operations and business data",
    permissions: [
      "orders.*",
      "products.*",
      "customers.*",
      "delivery.routes.*",
      "promotions.*",
      "business.info.read",
      "business.info.update",
      "audit.read",
    ],
    isSystem: true,
  },

  {
    name: "staff",
    description: "Handles day-to-day operations",
    permissions: [
      "orders.read",
      "orders.update",
      "products.read",
      "customers.read",
      "delivery.routes.read",
    ],
    isSystem: true,
  },

  {
    name: "driver",
    description: "Delivery access only",
    permissions: [
      "orders.read",
      "delivery.routes.read",
      "delivery.routes.update",
    ],
    isSystem: true,
  },
];

const seedDefaultRoles = async () => {
  for (const roleData of DEFAULT_ROLES) {
    const existing = await Role.findOne({ name: roleData.name });

    if (existing) {
      continue; // ✅ do nothing if role already exists
    }

    await Role.create(roleData);
    console.log(`✅ Seeded role: ${roleData.name}`);
  }
};

module.exports = {
  seedDefaultRoles,
};
