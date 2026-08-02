const mongoose = require("mongoose");

const Customer = require("../models/customer.model");
const Order = require("../models/order.model");
const Product = require("../models/product.model");
const Subscription = require("../models/subscription.model");
const ProductVariant = require("../models/variant.model");

const CUSTOMER_TYPES = new Set(["guest", "account"]);
const ORDER_STATUSES = new Set([
  "pending",
  "unpaid",
  "paid",
  "partially_paid",
  "failed",
  "cancelled",
  "refund_pending",
  "partially_refunded",
  "refunded",
  "refund_failed",
]);
const DELIVERY_STATUSES = new Set([
  "ordered",
  "dispatched",
  "in_transit",
  "delivered",
  "returned",
]);
const ORDER_TYPES = new Set(["one_time", "subscription_generated"]);
const SUBSCRIPTION_STATUSES = new Set(["active", "paused", "cancelled"]);
const SUBSCRIPTION_FREQUENCIES = new Set([
  "weekly",
  "every_two_weeks",
  "monthly",
]);

function cleanArray(value, allowedValues) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))]
    .filter((item) => !allowedValues || allowedValues.has(item))
    .slice(0, 100);
}

function cleanObjectIds(value) {
  return cleanArray(value).filter((id) => mongoose.Types.ObjectId.isValid(id));
}

function cleanDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeAudience(input = {}) {
  const hasSubscription = ["yes", "no"].includes(input.hasSubscription)
    ? input.hasSubscription
    : "any";
  const marketingPreference = ["opted_in", "opted_out"].includes(
    input.marketingPreference,
  )
    ? input.marketingPreference
    : "any";

  return {
    customerTypes: cleanArray(input.customerTypes, CUSTOMER_TYPES),
    joinedFrom: cleanDate(input.joinedFrom),
    joinedTo: cleanDate(input.joinedTo),
    lastOrderFrom: cleanDate(input.lastOrderFrom),
    lastOrderTo: cleanDate(input.lastOrderTo),
    postcodes: cleanArray(input.postcodes)
      .map((postcode) => postcode.toUpperCase())
      .slice(0, 30),
    marketingPreference,
    orderStatuses: cleanArray(input.orderStatuses, ORDER_STATUSES),
    deliveryStatuses: cleanArray(input.deliveryStatuses, DELIVERY_STATUSES),
    orderTypes: cleanArray(input.orderTypes, ORDER_TYPES),
    orderedFrom: cleanDate(input.orderedFrom),
    orderedTo: cleanDate(input.orderedTo),
    productIds: cleanObjectIds(input.productIds),
    variantIds: cleanObjectIds(input.variantIds),
    hasSubscription,
    subscriptionStatuses: cleanArray(
      input.subscriptionStatuses,
      SUBSCRIPTION_STATUSES,
    ),
    subscriptionFrequencies: cleanArray(
      input.subscriptionFrequencies,
      SUBSCRIPTION_FREQUENCIES,
    ),
    deliveryDays: cleanArray(input.deliveryDays)
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  };
}

function addDateRange(query, field, from, to) {
  if (!from && !to) return;
  query[field] = {};
  if (from) query[field].$gte = new Date(from);
  if (to) {
    const upper = new Date(to);
    upper.setUTCHours(23, 59, 59, 999);
    query[field].$lte = upper;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function intersectSets(sets) {
  if (!sets.length) return null;
  const [first, ...rest] = sets.sort((a, b) => a.size - b.size);
  return new Set([...first].filter((value) => rest.every((set) => set.has(value))));
}

function objectIdSet(ids = []) {
  return new Set(ids.map((id) => String(id)));
}

async function relatedCustomerIds(filters) {
  const requiredSets = [];
  const excludedSets = [];

  const hasOrderFilters =
    filters.orderStatuses.length > 0 ||
    filters.deliveryStatuses.length > 0 ||
    filters.orderTypes.length > 0 ||
    filters.orderedFrom ||
    filters.orderedTo;

  if (hasOrderFilters) {
    const query = { archived: { $ne: true } };
    if (filters.orderStatuses.length) query.status = { $in: filters.orderStatuses };
    if (filters.deliveryStatuses.length) {
      query.deliveryStatus = { $in: filters.deliveryStatuses };
    }
    if (filters.orderTypes.length) query.orderType = { $in: filters.orderTypes };
    addDateRange(query, "createdAt", filters.orderedFrom, filters.orderedTo);
    requiredSets.push(objectIdSet(await Order.distinct("customer", query)));
  }

  if (filters.productIds.length || filters.variantIds.length) {
    const orderQuery = { archived: { $ne: true } };
    const subscriptionQuery = {};
    if (filters.productIds.length) {
      orderQuery["items.product"] = { $in: filters.productIds };
      subscriptionQuery.$or = [
        { "items.product": { $in: filters.productIds } },
        { "deliveryDayPlans.items.product": { $in: filters.productIds } },
      ];
    }
    if (filters.variantIds.length) {
      orderQuery["items.variant"] = { $in: filters.variantIds };
      const variantConditions = [
        { "items.variant": { $in: filters.variantIds } },
        { "deliveryDayPlans.items.variant": { $in: filters.variantIds } },
      ];
      subscriptionQuery.$and = subscriptionQuery.$or
        ? [{ $or: subscriptionQuery.$or }, { $or: variantConditions }]
        : [{ $or: variantConditions }];
      delete subscriptionQuery.$or;
    }

    const [orderCustomers, subscriptionCustomers] = await Promise.all([
      Order.distinct("customer", orderQuery),
      Subscription.distinct("customer", subscriptionQuery),
    ]);
    requiredSets.push(
      objectIdSet([...orderCustomers, ...subscriptionCustomers]),
    );
  }

  const hasSubscriptionFilters =
    filters.subscriptionStatuses.length > 0 ||
    filters.subscriptionFrequencies.length > 0 ||
    filters.deliveryDays.length > 0;

  if (filters.hasSubscription !== "any" || hasSubscriptionFilters) {
    const query = {};
    if (filters.subscriptionStatuses.length) {
      query.status = { $in: filters.subscriptionStatuses };
    }
    if (filters.subscriptionFrequencies.length) {
      query.frequency = { $in: filters.subscriptionFrequencies };
    }
    if (filters.deliveryDays.length) {
      query.$or = [
        { preferredDeliveryDay: { $in: filters.deliveryDays } },
        { preferredDeliveryDays: { $in: filters.deliveryDays } },
      ];
    }
    const ids = objectIdSet(await Subscription.distinct("customer", query));
    if (filters.hasSubscription === "no") excludedSets.push(ids);
    else requiredSets.push(ids);
  }

  return { included: intersectSets(requiredSets), excluded: excludedSets };
}

function buildCustomerQuery(filters, messageType, related) {
  const query = {
    status: "active",
    email: { $exists: true, $nin: [null, ""] },
  };

  if (filters.customerTypes.length === 1) {
    query.isGuest = filters.customerTypes[0] === "guest";
  }
  addDateRange(query, "createdAt", filters.joinedFrom, filters.joinedTo);
  addDateRange(query, "lastOrderAt", filters.lastOrderFrom, filters.lastOrderTo);

  if (filters.postcodes.length) {
    query["addresses.postcode"] = {
      $in: filters.postcodes.map(
        (postcode) => new RegExp(`^${escapeRegex(postcode)}$`, "i"),
      ),
    };
  }

  if (messageType === "marketing" || filters.marketingPreference === "opted_in") {
    query["notificationPreferences.promotions"] = true;
  } else if (filters.marketingPreference === "opted_out") {
    query["notificationPreferences.promotions"] = { $ne: true };
  }

  const idConstraints = [];
  if (related.included) idConstraints.push({ $in: [...related.included] });
  for (const excluded of related.excluded) {
    idConstraints.push({ $nin: [...excluded] });
  }
  if (idConstraints.length === 1) query._id = idConstraints[0];
  if (idConstraints.length > 1) query.$and = idConstraints.map((_id) => ({ _id }));
  return query;
}

async function resolveAudience({ audience, messageType = "operational", sampleSize = 5 }) {
  const filters = normalizeAudience(audience);
  const related = await relatedCustomerIds(filters);

  if (related.included && related.included.size === 0) {
    return {
      filters,
      totalRecipients: 0,
      breakdown: { guests: 0, accounts: 0, marketingOptIn: 0 },
      sample: [],
      recipients: [],
    };
  }

  const customerQuery = buildCustomerQuery(filters, messageType, related);
  const [customers, breakdownRows] = await Promise.all([
    Customer.find(customerQuery)
      .select("_id email firstName lastName isGuest notificationPreferences")
      .sort({ firstName: 1, lastName: 1 })
      .lean(),
    Customer.aggregate([
      { $match: customerQuery },
      {
        $group: {
          _id: null,
          guests: { $sum: { $cond: ["$isGuest", 1, 0] } },
          accounts: { $sum: { $cond: ["$isGuest", 0, 1] } },
          marketingOptIn: {
            $sum: {
              $cond: [
                { $eq: ["$notificationPreferences.promotions", true] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const recipientsByEmail = new Map();
  for (const customer of customers) {
    const email = String(customer.email || "").trim().toLowerCase();
    if (!email || recipientsByEmail.has(email)) continue;
    recipientsByEmail.set(email, {
      email,
      firstName: customer.firstName || "",
      lastName: customer.lastName || "",
      customerId: customer._id,
    });
  }
  const recipients = [...recipientsByEmail.values()];
  const breakdown = breakdownRows[0] || {
    guests: 0,
    accounts: 0,
    marketingOptIn: 0,
  };
  delete breakdown._id;

  return {
    filters,
    totalRecipients: recipients.length,
    breakdown,
    sample: recipients.slice(0, Math.max(0, Math.min(sampleSize, 10))),
    recipients,
  };
}

async function getAudienceOptions() {
  const [products, variants] = await Promise.all([
    Product.find({ status: { $ne: "archived" } })
      .select("_id name status")
      .sort({ name: 1 })
      .lean(),
    ProductVariant.find({ status: { $ne: "archived" } })
      .select("_id product name sku status")
      .sort({ name: 1 })
      .lean(),
  ]);
  const productNames = new Map(products.map((product) => [String(product._id), product.name]));
  return {
    products,
    variants: variants.map((variant) => ({
      ...variant,
      productName: productNames.get(String(variant.product)) || "Product",
    })),
  };
}

module.exports = {
  normalizeAudience,
  resolveAudience,
  getAudienceOptions,
};
