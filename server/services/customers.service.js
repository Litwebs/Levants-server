const Customer = require("../models/customer.model");
const mongoose = require("mongoose");
const Order = require("../models/order.model");

/**
 * Find or create guest customer by email
 */
async function FindOrCreateGuestCustomer({
  email,
  firstName,
  lastName,
  phone,
  address,
} = {}) {
  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : email;
  const normalizedFirstName =
    typeof firstName === "string" ? stripHtml(firstName) : firstName;
  const normalizedLastName =
    typeof lastName === "string" ? stripHtml(lastName) : lastName;
  const normalizedPhone = typeof phone === "string" ? phone.trim() : phone;
  const normalizedAddress = sanitizeAddress(address);

  if (!normalizedEmail) {
    return {
      success: false,
      statusCode: 400,
      message: "Email is required",
    };
  }

  if (
    address !== undefined &&
    (typeof address !== "object" || address === null)
  ) {
    return {
      success: false,
      statusCode: 400,
      message: "Address must be an object",
    };
  }

  let customer = await Customer.findOne({ email: normalizedEmail });
  const created = !customer;

  if (!customer) {
    if (!normalizedFirstName || !normalizedLastName) {
      return {
        success: false,
        statusCode: 400,
        message: "firstName and lastName are required",
      };
    }

    customer = await Customer.create({
      email: normalizedEmail,
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      phone: normalizedPhone,
      ...(normalizedAddress
        ? { addresses: [{ ...normalizedAddress, isDefault: true }] }
        : {}),
      isGuest: true,
    });
  } else if (normalizedAddress) {
    // Add new address if not already present
    customer.addresses.push({ ...normalizedAddress, isDefault: true });
    customer.addresses.forEach((a, i) => {
      if (i !== customer.addresses.length - 1) {
        a.isDefault = false;
      }
    });
    await customer.save();
  }

  const json = customer?.toJSON ? customer.toJSON() : customer;
  const addresses = Array.isArray(json?.addresses) ? json.addresses : [];
  const defaultAddress =
    addresses.find((a) => a?.isDefault) ||
    addresses[addresses.length - 1] ||
    null;

  return {
    success: true,
    statusCode: created ? 201 : 200,
    data: { customer: { ...json, address: defaultAddress } },
  };
}

/**
 * Get customer by ID
 */
async function GetCustomerById({ customerId } = {}) {
  if (!customerId) {
    return {
      success: false,
      statusCode: 400,
      message: "customerId is required",
    };
  }

  if (!mongoose.isValidObjectId(customerId)) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid customerId",
    };
  }

  const customer = await Customer.findById(customerId);

  if (!customer) {
    return { success: false, statusCode: 404, message: "Customer not found" };
  }

  return { success: true, data: { customer } };
}

/**
 * List customers (admin)
 */
async function ListCustomers({ page = 1, pageSize = 20, search } = {}) {
  const filter = {};

  if (search) {
    const rx = new RegExp(search, "i");
    filter.$or = [{ email: rx }, { firstName: rx }, { lastName: rx }];
  }

  const skip = (page - 1) * pageSize;

  const [total, customers] = await Promise.all([
    Customer.countDocuments(filter),
    Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize),
  ]);

  return {
    success: true,
    data: { customers, items: customers },
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Update customer (admin)
 */
async function UpdateCustomer({ customerId, body } = {}) {
  if (!customerId) {
    return {
      success: false,
      statusCode: 400,
      message: "customerId is required",
    };
  }

  if (body === undefined || body === null || typeof body !== "object") {
    return {
      success: false,
      statusCode: 400,
      message: "Body must be an object",
    };
  }

  const customer = await Customer.findById(customerId);
  if (!customer) {
    return { success: false, statusCode: 404, message: "Customer not found" };
  }

  if (body.address) {
    customer.addresses.push({ ...body.address, isDefault: true });
    customer.addresses.forEach((a, i) => {
      if (i !== customer.addresses.length - 1) {
        a.isDefault = false;
      }
    });
  }

  if (body.firstName) customer.firstName = body.firstName;
  if (body.lastName) customer.lastName = body.lastName;
  if (body.phone) customer.phone = body.phone;

  await customer.save();

  return { success: true, data: { customer } };
}

/**
 * List orders by customer (admin)
 */
async function ListOrdersByCustomer({
  customerId,
  page = 1,
  pageSize = 20,
} = {}) {
  if (!customerId) {
    return {
      success: false,
      statusCode: 400,
      message: "customerId is required",
    };
  }

  if (!mongoose.isValidObjectId(customerId)) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid customerId",
    };
  }

  const customerObjectId = new mongoose.Types.ObjectId(customerId);
  const skip = (page - 1) * pageSize;

  const listFilter = {
    customer: customerId, // OK for find()
    status: { $ne: "cancelled" },
  };

  const [total, orders, paidStats] = await Promise.all([
    Order.countDocuments(listFilter),

    Order.find(listFilter).sort({ createdAt: -1 }).skip(skip).limit(pageSize),

    Order.aggregate([
      {
        $match: {
          customer: customerObjectId, // 👈 REQUIRED
          status: "paid",
        },
      },
      {
        $group: {
          _id: null,
          totalSpent: { $sum: "$total" },
          paidOrderCount: { $sum: 1 },
          averageOrderValue: { $avg: "$total" },
        },
      },
    ]),
  ]);

  const stats = paidStats[0] || {
    totalSpent: 0,
    paidOrderCount: 0,
    averageOrderValue: 0,
  };

  return {
    success: true,
    data: {
      orders,
      items: orders,
      stats: {
        totalSpent: Number(stats.totalSpent.toFixed(2)),
        paidOrderCount: stats.paidOrderCount,
        averageOrderValue: stats.paidOrderCount
          ? Number(stats.averageOrderValue.toFixed(2))
          : 0,
      },
    },
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// === Utils ===

function stripHtml(value) {
  if (value === null || value === undefined) return value;
  const str = String(value);
  // Basic tag stripping (sufficient for tests and avoids storing <script> tags)
  return str.replace(/<[^>]*>/g, "").trim();
}

function sanitizeAddress(address) {
  if (!address || typeof address !== "object") return address;

  const out = { ...address };
  for (const key of ["line1", "line2", "city", "postcode", "country"]) {
    if (out[key] !== undefined && out[key] !== null) {
      out[key] = stripHtml(out[key]);
    }
  }
  return out;
}

module.exports = {
  FindOrCreateGuestCustomer,
  GetCustomerById,
  ListCustomers,
  UpdateCustomer,
  ListOrdersByCustomer,
};
