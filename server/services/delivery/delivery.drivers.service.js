"use strict";

const User = require("../../models/user.model");
const Role = require("../../models/role.model");
const { normalizeDriverRouting } = require("../../utils/driverRouting.util");

async function listDrivers() {
  try {
    const driverRole = await Role.findOne({ name: "driver" }).select("_id");
    if (!driverRole) {
      return { success: true, data: { drivers: [] } };
    }

    const drivers = await User.find({ role: driverRole._id, status: "active" })
      .select("name email driverRouting")
      .sort({ name: 1 })
      .lean();

    return {
      success: true,
      data: {
        drivers: drivers.map((d) => ({
          id: d._id,
          name: d.name,
          email: d.email,
          driverRouting: normalizeDriverRouting(d.driverRouting || {}),
        })),
      },
    };
  } catch (err) {
    console.error("List drivers error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to list drivers",
    };
  }
}

async function getDepot() {
  const lat = Number(process.env.WAREHOUSE_LAT);
  const lng = Number(process.env.WAREHOUSE_LNG);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return {
      success: false,
      statusCode: 500,
      message: "WAREHOUSE_LAT/WAREHOUSE_LNG are not configured",
    };
  }

  return {
    success: true,
    data: {
      lat,
      lng,
      label: "Depot",
    },
  };
}

module.exports = { listDrivers, getDepot };
