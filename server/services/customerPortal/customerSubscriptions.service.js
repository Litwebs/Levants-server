"use strict";

const mongoose = require("mongoose");
const Subscription = require("../../models/subscription.model");
const SubscriptionDelivery = require("../../models/subscriptionDelivery.model");
const ProductVariant = require("../../models/variant.model");
const Customer = require("../../models/customer.model");
const CustomerNotification = require("../../models/customerNotification.model");
const { Response } = require("../../utils/response.util");

const FREQUENCY_DAYS = {
  weekly: 7,
  every_two_weeks: 14,
  monthly: 30,
};

/**
 * Calculate the next delivery date given a preferred day and frequency.
 * @param {number} preferredDay - 0-6 (Sun-Sat)
 * @param {string} frequency
 * @param {Date} [from] - reference date, defaults to now
 */
function calculateNextDeliveryDate(preferredDay, frequency, from = new Date()) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);

  const currentDay = start.getDay();
  let daysUntilPreferred = (preferredDay - currentDay + 7) % 7;

  // If today is the preferred day, push to next occurrence
  if (daysUntilPreferred === 0) {
    daysUntilPreferred = FREQUENCY_DAYS[frequency] || 7;
  }

  const next = new Date(start);
  next.setDate(start.getDate() + daysUntilPreferred);
  return next;
}

function addFrequencyDays(date, frequency) {
  const d = new Date(date);
  d.setDate(d.getDate() + (FREQUENCY_DAYS[frequency] || 7));
  return d;
}

/**
 * Pre-generate upcoming SubscriptionDelivery slots (3 upcoming).
 */
async function scheduleUpcomingDeliveries(subscription, session) {
  const slots = [];
  let nextDate = new Date(subscription.nextDeliveryDate);

  for (let i = 0; i < 3; i++) {
    // Check if a slot for this date already exists
    const exists = await SubscriptionDelivery.findOne({
      subscription: subscription._id,
      scheduledDate: nextDate,
    }).session(session || null);

    if (!exists) {
      slots.push({
        subscription: subscription._id,
        customer: subscription.customer,
        scheduledDate: new Date(nextDate),
        status: "scheduled",
      });
    }
    nextDate = addFrequencyDays(nextDate, subscription.frequency);
  }

  if (slots.length > 0) {
    await SubscriptionDelivery.insertMany(slots, { session: session || null });
  }
}

/**
 * Create a new subscription.
 */
async function CreateSubscription({
  customerId,
  frequency,
  preferredDeliveryDay,
  deliveryAddressId,
  notes,
  items,
} = {}) {
  const customer = await Customer.findById(customerId);
  if (!customer) return Response(false, "Customer not found", null);

  const address = customer.addresses.id(deliveryAddressId);
  if (!address) return Response(false, "Delivery address not found", null);

  // Resolve variants
  const variantIds = items.map((i) => new mongoose.Types.ObjectId(i.variantId));
  const variants = await ProductVariant.find({
    _id: { $in: variantIds },
    status: "active",
  }).populate("product", "name status isSubscriptionEligible");

  if (variants.length !== items.length) {
    return Response(false, "One or more products are unavailable", null);
  }

  for (const v of variants) {
    if (!v.product || v.product.status !== "active") {
      return Response(false, `Product "${v.name}" is not available`, null);
    }
    if (!v.product.isSubscriptionEligible) {
      return Response(
        false,
        `"${v.product.name}" is not eligible for subscriptions`,
        null,
      );
    }
  }

  const variantMap = new Map(variants.map((v) => [String(v._id), v]));
  const subscriptionItems = items.map((item) => {
    const variant = variantMap.get(String(item.variantId));
    return {
      product: variant.product._id,
      variant: variant._id,
      name: `${variant.product.name} – ${variant.name}`,
      sku: variant.sku,
      quantity: item.quantity,
      unitPrice: variant.price,
    };
  });

  const nextDeliveryDate = calculateNextDeliveryDate(
    preferredDeliveryDay,
    frequency,
  );
  const startDate = new Date();

  const subscription = await Subscription.create({
    customer: customer._id,
    frequency,
    preferredDeliveryDay,
    nextDeliveryDate,
    startDate,
    deliveryAddress: {
      line1: address.line1,
      line2: address.line2 || null,
      city: address.city,
      postcode: address.postcode,
      country: address.country,
      deliveryInstructions: address.deliveryInstructions || null,
    },
    items: subscriptionItems,
    notes: notes || null,
    status: "active",
  });

  await scheduleUpcomingDeliveries(subscription);

  await CustomerNotification.create({
    customer: customer._id,
    type: "subscription_created",
    title: "Subscription created",
    message: `Your ${frequency.replace("_", " ")} subscription has been set up for ${nextDeliveryDate.toLocaleDateString("en-GB")}.`,
    relatedSubscription: subscription._id,
  });

  return Response(true, "Subscription created", { subscription });
}

/**
 * List subscriptions for a customer.
 */
async function ListSubscriptions({
  customerId,
  status,
  page = 1,
  pageSize = 20,
} = {}) {
  const filter = { customer: customerId };
  if (status) filter.status = status;

  const total = await Subscription.countDocuments(filter);
  const subscriptions = await Subscription.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  return Response(true, null, {
    subscriptions,
    meta: { page, pageSize, total },
  });
}

/**
 * Get single subscription.
 */
async function GetSubscription({ customerId, subscriptionId } = {}) {
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  }).lean();
  if (!subscription) return Response(false, "Subscription not found", null);
  return Response(true, null, { subscription });
}

/**
 * Update subscription settings (frequency, delivery day, address, notes).
 */
async function UpdateSubscription({
  customerId,
  subscriptionId,
  frequency,
  preferredDeliveryDay,
  deliveryAddressId,
  notes,
} = {}) {
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  });
  if (!subscription) return Response(false, "Subscription not found", null);

  if (subscription.status === "cancelled") {
    return Response(false, "Cannot update a cancelled subscription", null);
  }

  if (frequency !== undefined) subscription.frequency = frequency;
  if (preferredDeliveryDay !== undefined)
    subscription.preferredDeliveryDay = preferredDeliveryDay;
  if (notes !== undefined) subscription.notes = notes || null;

  if (deliveryAddressId !== undefined) {
    const customer = await Customer.findById(customerId);
    const address = customer && customer.addresses.id(deliveryAddressId);
    if (!address) return Response(false, "Address not found", null);
    subscription.deliveryAddress = {
      line1: address.line1,
      line2: address.line2 || null,
      city: address.city,
      postcode: address.postcode,
      country: address.country,
      deliveryInstructions: address.deliveryInstructions || null,
    };
  }

  // Recalculate next delivery date if frequency or day changed
  if (frequency !== undefined || preferredDeliveryDay !== undefined) {
    subscription.nextDeliveryDate = calculateNextDeliveryDate(
      subscription.preferredDeliveryDay,
      subscription.frequency,
    );
    // Generate new upcoming delivery slots
    await scheduleUpcomingDeliveries(subscription);
  }

  await subscription.save();

  await CustomerNotification.create({
    customer: customerId,
    type: "subscription_updated",
    title: "Subscription updated",
    message: "Your subscription has been updated.",
    relatedSubscription: subscription._id,
  });

  return Response(true, "Subscription updated", { subscription });
}

/**
 * Pause a subscription.
 */
async function PauseSubscription({ customerId, subscriptionId } = {}) {
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  });
  if (!subscription) return Response(false, "Subscription not found", null);
  if (subscription.status !== "active") {
    return Response(false, "Only active subscriptions can be paused", null);
  }

  subscription.status = "paused";
  subscription.pausedAt = new Date();
  await subscription.save();

  // Cancel upcoming scheduled deliveries
  await SubscriptionDelivery.updateMany(
    { subscription: subscription._id, status: "scheduled" },
    { $set: { status: "cancelled" } },
  );

  await CustomerNotification.create({
    customer: customerId,
    type: "subscription_paused",
    title: "Subscription paused",
    message:
      "Your subscription has been paused. No more deliveries will be scheduled until you resume.",
    relatedSubscription: subscription._id,
  });

  return Response(true, "Subscription paused", { subscription });
}

/**
 * Resume a paused subscription.
 */
async function ResumeSubscription({ customerId, subscriptionId } = {}) {
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  });
  if (!subscription) return Response(false, "Subscription not found", null);
  if (subscription.status !== "paused") {
    return Response(false, "Only paused subscriptions can be resumed", null);
  }

  subscription.status = "active";
  subscription.pausedAt = null;
  subscription.nextDeliveryDate = calculateNextDeliveryDate(
    subscription.preferredDeliveryDay,
    subscription.frequency,
  );
  await subscription.save();

  await scheduleUpcomingDeliveries(subscription);

  await CustomerNotification.create({
    customer: customerId,
    type: "subscription_resumed",
    title: "Subscription resumed",
    message: `Your subscription is active again. Next delivery: ${subscription.nextDeliveryDate.toLocaleDateString("en-GB")}.`,
    relatedSubscription: subscription._id,
  });

  return Response(true, "Subscription resumed", { subscription });
}

/**
 * Cancel a subscription.
 */
async function CancelSubscription({ customerId, subscriptionId, reason } = {}) {
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  });
  if (!subscription) return Response(false, "Subscription not found", null);
  if (subscription.status === "cancelled") {
    return Response(false, "Subscription is already cancelled", null);
  }

  subscription.status = "cancelled";
  subscription.cancelledAt = new Date();
  subscription.cancelReason = reason || null;
  await subscription.save();

  // Cancel upcoming scheduled deliveries
  await SubscriptionDelivery.updateMany(
    { subscription: subscription._id, status: "scheduled" },
    { $set: { status: "cancelled" } },
  );

  await CustomerNotification.create({
    customer: customerId,
    type: "subscription_cancelled",
    title: "Subscription cancelled",
    message: "Your subscription has been cancelled.",
    relatedSubscription: subscription._id,
  });

  return Response(true, "Subscription cancelled", { subscription });
}

/**
 * Add item to a subscription.
 */
async function AddSubscriptionItem({
  customerId,
  subscriptionId,
  variantId,
  quantity,
} = {}) {
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  });
  if (!subscription) return Response(false, "Subscription not found", null);
  if (subscription.status === "cancelled") {
    return Response(false, "Cannot modify a cancelled subscription", null);
  }

  const variant = await ProductVariant.findById(variantId).populate(
    "product",
    "name status isSubscriptionEligible",
  );
  if (!variant || variant.status !== "active") {
    return Response(false, "Product is not available", null);
  }
  if (!variant.product || variant.product.status !== "active") {
    return Response(false, "Product is not available", null);
  }
  if (!variant.product.isSubscriptionEligible) {
    return Response(false, "This product is not subscription eligible", null);
  }

  // Check for existing item with same variant
  const existingIndex = subscription.items.findIndex(
    (i) => String(i.variant) === String(variantId),
  );

  if (existingIndex >= 0) {
    subscription.items[existingIndex].quantity += quantity;
  } else {
    subscription.items.push({
      product: variant.product._id,
      variant: variant._id,
      name: `${variant.product.name} – ${variant.name}`,
      sku: variant.sku,
      quantity,
      unitPrice: variant.price,
    });
  }

  await subscription.save();
  return Response(true, "Item added", { subscription });
}

/**
 * Update a subscription item quantity.
 */
async function UpdateSubscriptionItem({
  customerId,
  subscriptionId,
  itemId,
  quantity,
} = {}) {
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  });
  if (!subscription) return Response(false, "Subscription not found", null);
  if (subscription.status === "cancelled") {
    return Response(false, "Cannot modify a cancelled subscription", null);
  }

  const item = subscription.items.id(itemId);
  if (!item) return Response(false, "Item not found", null);

  item.quantity = quantity;
  await subscription.save();
  return Response(true, "Item updated", { subscription });
}

/**
 * Remove a subscription item.
 */
async function RemoveSubscriptionItem({
  customerId,
  subscriptionId,
  itemId,
} = {}) {
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  });
  if (!subscription) return Response(false, "Subscription not found", null);
  if (subscription.status === "cancelled") {
    return Response(false, "Cannot modify a cancelled subscription", null);
  }

  const item = subscription.items.id(itemId);
  if (!item) return Response(false, "Item not found", null);

  if (subscription.items.length <= 1) {
    return Response(
      false,
      "Cannot remove the last item. Please cancel the subscription instead.",
      null,
    );
  }

  item.deleteOne();
  await subscription.save();
  return Response(true, "Item removed", { subscription });
}

/**
 * Get scheduled deliveries for a subscription.
 */
async function GetSubscriptionDeliveries({
  customerId,
  subscriptionId,
  page = 1,
  pageSize = 20,
} = {}) {
  // Verify ownership
  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  }).lean();
  if (!subscription) return Response(false, "Subscription not found", null);

  const total = await SubscriptionDelivery.countDocuments({
    subscription: subscriptionId,
  });
  const deliveries = await SubscriptionDelivery.find({
    subscription: subscriptionId,
  })
    .populate("order", "orderId status deliveryStatus total")
    .sort({ scheduledDate: 1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  return Response(true, null, { deliveries, meta: { page, pageSize, total } });
}

module.exports = {
  CreateSubscription,
  ListSubscriptions,
  GetSubscription,
  UpdateSubscription,
  PauseSubscription,
  ResumeSubscription,
  CancelSubscription,
  AddSubscriptionItem,
  UpdateSubscriptionItem,
  RemoveSubscriptionItem,
  GetSubscriptionDeliveries,
  calculateNextDeliveryDate,
  addFrequencyDays,
  scheduleUpcomingDeliveries,
};
