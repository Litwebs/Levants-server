const Customer = require("../models/customer.model");
const mongoose = require("mongoose");
const Order = require("../models/order.model");
const ProductVariant = require("../models/variant.model");
const Subscription = require("../models/subscription.model");
const SubscriptionSettings = require("../models/subscriptionSettings.model");
const crypto = require("crypto");
const cryptoUtil = require("../utils/crypto.util");
const sendEmail = require("../Integration/Email.service");

const DEFAULT_PORTAL_INVITE_TTL_MINUTES = Number(
  process.env.CUSTOMER_PORTAL_INVITE_TTL_MINUTES || 72 * 60,
);

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

  let customer = await Customer.findOne({ email: normalizedEmail }).sort({
    createdAt: -1,
  });
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
      isGuest: true,
    });
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

function getCustomerPortalBaseUrl() {
  const env = process.env.NODE_ENV;
  const base =
    env === "production"
      ? process.env.CUSTOMER_PORTAL_URL_PROD ||
        process.env.CLIENT_FRONT_URL_PROD ||
        process.env.FRONTEND_URL_PROD
      : process.env.CUSTOMER_PORTAL_URL_DEV ||
        process.env.CLIENT_FRONT_URL_DEV ||
        process.env.FRONTEND_URL_DEV ||
        "http://localhost:8080";

  return String(base || "").replace(/\/$/, "");
}

function buildPortalOnboardingLink(token) {
  const base = getCustomerPortalBaseUrl();
  if (!base) return "";
  const params = new URLSearchParams({
    invite: token,
    redirect: "/portal/subscriptions/new?prepared=1",
  });
  return `${base}/register?${params.toString()}`;
}

function buildExistingCustomerSetupLink(email) {
  const base = getCustomerPortalBaseUrl();
  if (!base) return "";
  const params = new URLSearchParams({
    redirect: "/portal/subscriptions/new?prepared=1",
    email: String(email || ""),
  });
  return `${base}/login?${params.toString()}`;
}

async function CreateCustomerOnboardingLink({
  email,
  firstName,
  lastName,
  phone,
  address,
  subscription,
  linkTtlMinutes,
} = {}) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const normalizedFirstName = normalizeText(stripHtml(firstName));
  const normalizedLastName = normalizeText(stripHtml(lastName));
  const normalizedPhone = phone ? String(phone).trim() : null;
  const normalizedAddress = sanitizeAddress(address);

  if (!normalizedEmail || !normalizedFirstName || !normalizedLastName) {
    return {
      success: false,
      statusCode: 400,
      message: "email, firstName, and lastName are required",
    };
  }

  const existing = await Customer.findOne({ email: normalizedEmail }).sort({
    createdAt: -1,
  });

  const existingRegisteredCustomer = Boolean(existing && !existing.isGuest);

  const ttlMinutes = Math.max(
    15,
    Number.isFinite(Number(linkTtlMinutes))
      ? Math.floor(Number(linkTtlMinutes))
      : DEFAULT_PORTAL_INVITE_TTL_MINUTES,
  );

  const rawInviteToken = crypto.randomBytes(32).toString("hex");
  const inviteTokenHash = cryptoUtil.hashToken(rawInviteToken);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  let customer = existing;
  if (!customer) {
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
  } else {
    customer.firstName = normalizedFirstName;
    customer.lastName = normalizedLastName;
    customer.phone = normalizedPhone;
    if (normalizedAddress) {
      upsertDefaultAddress(customer, normalizedAddress);
    }
  }

  if (!existingRegisteredCustomer) {
    customer.portalInviteTokenHash = inviteTokenHash;
    customer.portalInviteTokenExpiresAt = expiresAt;
    customer.portalInviteSentAt = new Date();
    customer.portalInviteAcceptedAt = null;
  }
  if (subscription) {
    const defaultAddress =
      customer.addresses.find((entry) => entry.isDefault) ||
      customer.addresses[customer.addresses.length - 1];
    if (!defaultAddress) {
      return {
        success: false,
        statusCode: 400,
        message: "A delivery address is required for the subscription",
      };
    }

    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    const dayPlans = Array.isArray(subscription.deliveryDayPlans)
      ? subscription.deliveryDayPlans
      : [];

    const quantityByVariant = new Map();
    const dayQuantities = {};

    if (dayPlans.length > 0) {
      dayPlans.forEach((plan) => {
        const dayIndex = Number(plan?.day);
        const dayName = Number.isInteger(dayIndex) ? dayNames[dayIndex] : null;
        if (!dayName) return;

        const dayMap = {};
        (plan.items || []).forEach((item) => {
          const variantId = String(item.variantId);
          const qty = Number(item.quantity);
          if (!variantId || !Number.isFinite(qty) || qty < 1) return;

          dayMap[variantId] = qty;
          const current = quantityByVariant.get(variantId) || 0;
          quantityByVariant.set(variantId, Math.max(current, qty));
        });

        if (Object.keys(dayMap).length > 0) {
          dayQuantities[dayName] = dayMap;
        }
      });
    }

    if (quantityByVariant.size === 0) {
      subscription.items.forEach((item) => {
        const variantId = String(item.variantId);
        const qty = Number(item.quantity);
        if (!variantId || !Number.isFinite(qty) || qty < 1) return;
        quantityByVariant.set(variantId, qty);
      });
    }

    const normalizedDeliveryDays = (
      subscription.preferredDeliveryDays?.length
        ? subscription.preferredDeliveryDays
        : [subscription.preferredDeliveryDay]
    )
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

    customer.pendingSubscriptionDraft = {
      step: 5,
      selectedVariantIds: Array.from(quantityByVariant.keys()),
      quantities: Object.fromEntries(quantityByVariant.entries()),
      dayQuantities,
      frequency:
        subscription.frequency === "every_two_weeks"
          ? "fortnightly"
          : subscription.frequency,
      deliveryDays: normalizedDeliveryDays.map((day) => dayNames[day]),
      selectedAddress: String(defaultAddress._id),
      notes: subscription.notes || "",
      preparedByAdmin: true,
    };
  }
  await customer.save();

  const onboardingLink = existingRegisteredCustomer
    ? buildExistingCustomerSetupLink(normalizedEmail)
    : buildPortalOnboardingLink(rawInviteToken);
  const expiresAtLabel = expiresAt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  try {
    await sendEmail(
      normalizedEmail,
      "Complete your Levants subscription setup",
      "serviceAnnouncement",
      {
        customerName: normalizedFirstName,
        title: "Your account setup link",
        description:
          `An admin has prepared your account for subscriptions. ` +
          (existingRegisteredCustomer
            ? `Please sign in and add a payment method to complete setup.\n\n`
            : `Please open the link below, verify your email, and add a payment method to complete setup.\n\n`) +
          `${onboardingLink}\n\n` +
          `This link expires on ${expiresAtLabel}.`,
      },
    );
  } catch {
    // Ignore email transport errors for link generation; admin can still copy/share the link.
  }

  return {
    success: true,
    message: "Customer onboarding link created",
    data: {
      customer,
      onboardingLink,
      expiresAt,
    },
  };
}

async function CreateBulkCustomerOnboardingLinks({ rows } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      success: false,
      statusCode: 400,
      message: "At least one customer row is required",
    };
  }

  const requestedVariantIds = [
    ...new Set(
      rows.flatMap((row) =>
        (row.subscription?.items || []).map((item) => String(item.variantId)),
      ),
    ),
  ];
  const variants = await ProductVariant.find({
    _id: { $in: requestedVariantIds },
    status: "active",
  })
    .populate("product", "status isSubscriptionEligible")
    .lean();
  const allowedVariantIds = new Set(
    variants
      .filter(
        (variant) =>
          variant.product?.status === "active" &&
          variant.product?.isSubscriptionEligible !== false,
      )
      .map((variant) => String(variant._id)),
  );
  const settings = await SubscriptionSettings.findOne({
    singletonKey: "subscription-settings",
  }).lean();
  const availableDays = new Set(settings?.deliveryDays || [0, 3]);
  const seenEmails = new Set();
  const results = [];

  for (const row of rows) {
    const email = String(row.email || "")
      .trim()
      .toLowerCase();
    const rowResult = {
      rowNumber: row.rowNumber,
      email,
      customerName: `${row.firstName} ${row.lastName}`.trim(),
    };

    if (seenEmails.has(email)) {
      results.push({
        ...rowResult,
        status: "failed",
        message: "Duplicate email in this CSV",
      });
      continue;
    }
    seenEmails.add(email);

    const invalidVariant = (row.subscription?.items || []).find(
      (item) => !allowedVariantIds.has(String(item.variantId)),
    );
    if (invalidVariant) {
      results.push({
        ...rowResult,
        status: "failed",
        message:
          "One or more products are inactive or not subscription eligible",
      });
      continue;
    }

    const requestedDays = row.subscription.preferredDeliveryDays?.length
      ? row.subscription.preferredDeliveryDays
      : [row.subscription.preferredDeliveryDay];
    if (requestedDays.some((day) => !availableDays.has(day))) {
      results.push({
        ...rowResult,
        status: "failed",
        message: "A delivery day is not currently available",
      });
      continue;
    }
    if (row.subscription.frequency !== "weekly" && requestedDays.length > 1) {
      results.push({
        ...rowResult,
        status: "failed",
        message: "Only weekly subscriptions can use multiple delivery days",
      });
      continue;
    }

    const existingCustomer = await Customer.findOne({ email })
      .sort({ createdAt: -1 })
      .select("_id pendingSubscriptionDraft")
      .lean();
    if (existingCustomer?.pendingSubscriptionDraft) {
      results.push({
        ...rowResult,
        status: "failed",
        message: "Customer already has a pending subscription setup",
      });
      continue;
    }
    if (existingCustomer) {
      const existingSubscription = await Subscription.exists({
        customer: existingCustomer._id,
        status: { $in: ["active", "paused"] },
      });
      if (existingSubscription) {
        results.push({
          ...rowResult,
          status: "failed",
          message: "Customer already has an active or paused subscription",
        });
        continue;
      }
    }

    try {
      const created = await CreateCustomerOnboardingLink(row);
      if (!created.success) {
        results.push({
          ...rowResult,
          status: "failed",
          message: created.message || "Could not create setup",
        });
        continue;
      }
      results.push({
        ...rowResult,
        status: "created",
        message: "Pending setup created; onboarding link is ready",
        onboardingLink: created.data.onboardingLink,
      });
    } catch (error) {
      results.push({
        ...rowResult,
        status: "failed",
        message: error?.message || "Could not create setup",
      });
    }
  }

  const createdCount = results.filter((row) => row.status === "created").length;
  return {
    success: true,
    message:
      createdCount === rows.length
        ? "All subscription setups were imported"
        : "Import completed with row errors",
    data: {
      summary: {
        total: rows.length,
        created: createdCount,
        failed: rows.length - createdCount,
      },
      results,
    },
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
async function ListCustomers({
  page = 1,
  pageSize = 20,
  search,
  type = "all",
  sort = "newest",
} = {}) {
  const filter = {};

  if (search) {
    const escapedSearch = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(escapedSearch, "i");
    filter.$or = [
      { email: rx },
      { firstName: rx },
      { lastName: rx },
      { phone: rx },
      { "addresses.postcode": rx },
    ];
  }

  if (type === "guest") filter.isGuest = true;
  if (type === "registered") filter.isGuest = false;

  const sortOptions = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    "name-asc": { firstName: 1, lastName: 1, createdAt: -1 },
    "name-desc": { firstName: -1, lastName: -1, createdAt: -1 },
  };
  const sortBy = sortOptions[sort] || sortOptions.newest;

  const skip = (page - 1) * pageSize;

  const [total, customers, registeredCustomers, guestCustomers] =
    await Promise.all([
      Customer.countDocuments(filter),
      Customer.find(filter).sort(sortBy).skip(skip).limit(pageSize),
      Customer.countDocuments({ isGuest: false }),
      Customer.countDocuments({ isGuest: true }),
    ]);

  return {
    success: true,
    data: { customers, items: customers },
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      summary: {
        totalCustomers: registeredCustomers + guestCustomers,
        registeredCustomers,
        guestCustomers,
      },
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

  if (body.email !== undefined) {
    const normalizedEmail = String(body.email).trim().toLowerCase();
    const emailOwner = await Customer.findOne({
      email: normalizedEmail,
      _id: { $ne: customer._id },
    }).select("_id");

    if (emailOwner) {
      return {
        success: false,
        statusCode: 409,
        message: "A customer with this email already exists",
      };
    }

    if (customer.email !== normalizedEmail) {
      customer.email = normalizedEmail;
      // A registered customer's verified email must never carry over to a
      // different address. Their next login will send a fresh verification code.
      if (!customer.isGuest) customer.emailVerifiedAt = null;
    }
  }

  if (body.address) {
    const normalizedAddress = sanitizeAddress(body.address);
    upsertDefaultAddress(customer, normalizedAddress);
  }

  if (body.firstName !== undefined) {
    customer.firstName = normalizeText(stripHtml(body.firstName));
  }
  if (body.lastName !== undefined) {
    customer.lastName = normalizeText(stripHtml(body.lastName));
  }
  if (body.phone !== undefined) {
    customer.phone = body.phone ? String(body.phone).trim() : null;
  }
  if (body.status !== undefined) customer.status = body.status;

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

  const out =
    typeof address?.toObject === "function"
      ? address.toObject({ virtuals: false, getters: false })
      : { ...address };

  for (const key of ["line1", "line2", "city", "postcode", "country"]) {
    if (out[key] !== undefined && out[key] !== null) {
      out[key] = normalizeText(stripHtml(out[key]));
    }
  }

  if (typeof out.line2 === "string" && out.line2.trim() === "") {
    out.line2 = null;
  }

  if (typeof out.postcode === "string") {
    out.postcode = out.postcode.toUpperCase();
  }
  if (typeof out.country === "string") {
    out.country = out.country.toUpperCase();
  }

  return out;
}

function normalizeText(value) {
  if (value === null || value === undefined) return value;
  const str = String(value);
  return str.replace(/\s+/g, " ").trim();
}

function canonicalizeAddress(address) {
  if (!address || typeof address !== "object") return null;

  const normalized = sanitizeAddress(address);
  if (!normalized) return null;

  const line1 =
    typeof normalized.line1 === "string"
      ? normalized.line1.toLowerCase()
      : null;
  const line2Raw = normalized.line2;
  const line2 =
    typeof line2Raw === "string" && line2Raw.trim() !== ""
      ? line2Raw.toLowerCase()
      : null;
  const city =
    typeof normalized.city === "string" ? normalized.city.toLowerCase() : null;

  // Compare postcodes case-insensitively and space-insensitively.
  const postcode =
    typeof normalized.postcode === "string"
      ? normalized.postcode.replace(/\s+/g, "").toUpperCase()
      : null;

  const country =
    typeof normalized.country === "string"
      ? normalized.country.replace(/\s+/g, "").toUpperCase()
      : null;

  return { line1, line2, city, postcode, country };
}

function addressesEqual(a, b) {
  const ca = canonicalizeAddress(a);
  const cb = canonicalizeAddress(b);
  if (!ca || !cb) return false;

  return (
    ca.line1 === cb.line1 &&
    ca.line2 === cb.line2 &&
    ca.city === cb.city &&
    ca.postcode === cb.postcode &&
    ca.country === cb.country
  );
}

/**
 * Ensures an address exists on the customer and is marked as default.
 * - If matching address exists, reuses it (no new address inserted).
 * - If it does not exist, adds it.
 * Returns true if any mutation happened that requires saving.
 */
function upsertDefaultAddress(customer, address) {
  if (!customer || !address) return false;

  const addresses = Array.isArray(customer.addresses) ? customer.addresses : [];
  const matchIndex = addresses.findIndex((a) => addressesEqual(a, address));

  let changed = false;

  if (matchIndex === -1) {
    customer.addresses.push({ ...address, isDefault: true });
    changed = true;
  }

  const defaultIndex =
    matchIndex === -1 ? customer.addresses.length - 1 : matchIndex;
  customer.addresses.forEach((a, i) => {
    const nextDefault = i === defaultIndex;
    if (a.isDefault !== nextDefault) {
      a.isDefault = nextDefault;
      changed = true;
    }
  });

  return changed;
}

module.exports = {
  FindOrCreateGuestCustomer,
  CreateCustomerOnboardingLink,
  CreateBulkCustomerOnboardingLinks,
  GetCustomerById,
  ListCustomers,
  UpdateCustomer,
  ListOrdersByCustomer,
  GetCustomerCredit,
  AdjustCustomerCredit,
};

/**
 * Get a customer's store-credit balance + paginated ledger history (admin).
 */
async function GetCustomerCredit({ customerId, page = 1, pageSize = 20 } = {}) {
  if (!mongoose.isValidObjectId(customerId)) {
    return { success: false, statusCode: 400, message: "Invalid customerId" };
  }

  const customer = await Customer.findById(customerId).select("creditBalance");
  if (!customer) {
    return { success: false, statusCode: 404, message: "Customer not found" };
  }

  const storeCreditService = require("./storeCredit.service");
  const ledger = await storeCreditService.listTransactions({
    customerId,
    page,
    pageSize,
  });

  return {
    success: true,
    data: {
      balance: customer.creditBalance || 0,
      transactions: ledger.transactions,
    },
    meta: { page, pageSize, total: ledger.meta.total },
  };
}

/**
 * Manually adjust a customer's store credit (admin). `amount` is in POUNDS and
 * may be negative to deduct credit.
 */
async function AdjustCustomerCredit({
  customerId,
  amount,
  reason,
  actorUserId,
} = {}) {
  if (!mongoose.isValidObjectId(customerId)) {
    return { success: false, statusCode: 400, message: "Invalid customerId" };
  }

  const amountMinor = Math.round(Number(amount) * 100);
  if (!Number.isFinite(amountMinor) || amountMinor === 0) {
    return {
      success: false,
      statusCode: 400,
      message: "Amount must be a non-zero number",
    };
  }

  const storeCreditService = require("./storeCredit.service");
  const result = await storeCreditService.adjust({
    customerId,
    amountMinor,
    reason,
    actorUserId,
  });

  if (!result.ok) {
    return {
      success: false,
      statusCode: 400,
      message: result.message || "Failed to adjust credit",
    };
  }

  return {
    success: true,
    data: { balance: result.balance, transaction: result.transaction },
  };
}
