"use strict";

const Subscription = require("../../models/subscription.model");
const SubscriptionDelivery = require("../../models/subscriptionDelivery.model");
const Order = require("../../models/order.model");
const Customer = require("../../models/customer.model");
const CustomerNotification = require("../../models/customerNotification.model");
const ProductVariant = require("../../models/variant.model");
const {
  PauseSubscription,
  ResumeSubscription,
  CancelSubscription,
  UpdateSubscription,
  AddSubscriptionItem,
  UpdateSubscriptionItem,
  RemoveSubscriptionItem,
  GetSubscriptionDeliveries,
} = require("./customerSubscriptions.service");
const { Response } = require("../../utils/response.util");

async function enrichSubscriptionWithVariantImages(subscription) {
  if (!subscription) return subscription;
  const items = Array.isArray(subscription.items) ? subscription.items : [];
  if (items.length === 0) return subscription;

  const variantIds = items
    .map((item) => String(item?.variant || ""))
    .filter(Boolean);
  if (variantIds.length === 0) return subscription;

  const variants = await ProductVariant.find({ _id: { $in: variantIds } })
    .populate("thumbnailImage", "url")
    .select("thumbnailImage")
    .lean();

  const imageByVariantId = new Map(
    variants.map((variant) => [
      String(variant._id),
      variant.thumbnailImage?.url || null,
    ]),
  );

  return {
    ...subscription,
    items: items.map((item) => ({
      ...item,
      imageUrl: imageByVariantId.get(String(item?.variant || "")) || null,
    })),
  };
}

/**
 * List all subscriptions (admin).
 */
async function AdminListSubscriptions({
  status,
  frequency,
  search,
  page = 1,
  pageSize = 20,
} = {}) {
  const filter = {};
  if (status) filter.status = status;
  if (frequency) filter.frequency = frequency;

  let customerIds = null;
  if (search) {
    const regex = new RegExp(search, "i");
    const customers = await Customer.find({
      $or: [{ firstName: regex }, { lastName: regex }, { email: regex }],
    })
      .select("_id")
      .lean();
    customerIds = customers.map((c) => c._id);
    filter.customer = { $in: customerIds };
  }

  const total = await Subscription.countDocuments(filter);
  const subscriptions = await Subscription.find(filter)
    .populate("customer", "firstName lastName email phone")
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
 * Get single subscription (admin).
 */
async function AdminGetSubscription({ subscriptionId } = {}) {
  const subscription = await Subscription.findById(subscriptionId)
    .populate("customer", "firstName lastName email phone addresses")
    .lean();

  if (!subscription) return Response(false, "Subscription not found", null);
  const enriched = await enrichSubscriptionWithVariantImages(subscription);
  return Response(true, null, { subscription: enriched });
}

/**
 * Admin: pause subscription on behalf of customer.
 */
async function AdminPauseSubscription({ subscriptionId } = {}) {
  const subscription = await Subscription.findById(subscriptionId);
  if (!subscription) return Response(false, "Subscription not found", null);
  return PauseSubscription({
    customerId: String(subscription.customer),
    subscriptionId,
  });
}

/**
 * Admin: resume subscription on behalf of customer.
 */
async function AdminResumeSubscription({ subscriptionId } = {}) {
  const subscription = await Subscription.findById(subscriptionId);
  if (!subscription) return Response(false, "Subscription not found", null);
  return ResumeSubscription({
    customerId: String(subscription.customer),
    subscriptionId,
  });
}

/**
 * Admin: cancel subscription on behalf of customer.
 */
async function AdminCancelSubscription({ subscriptionId, reason } = {}) {
  const subscription = await Subscription.findById(subscriptionId);
  if (!subscription) return Response(false, "Subscription not found", null);
  return CancelSubscription({
    customerId: String(subscription.customer),
    subscriptionId,
    reason,
  });
}

/**
 * Admin: update subscription.
 */
async function AdminUpdateSubscription({ subscriptionId, ...fields } = {}) {
  const subscription = await Subscription.findById(subscriptionId);
  if (!subscription) return Response(false, "Subscription not found", null);
  return UpdateSubscription({
    customerId: String(subscription.customer),
    subscriptionId,
    ...fields,
  });
}

/**
 * Admin: add item.
 */
async function AdminAddSubscriptionItem({
  subscriptionId,
  variantId,
  quantity,
} = {}) {
  const subscription = await Subscription.findById(subscriptionId);
  if (!subscription) return Response(false, "Subscription not found", null);
  return AddSubscriptionItem({
    customerId: String(subscription.customer),
    subscriptionId,
    variantId,
    quantity,
  });
}

/**
 * Admin: update item.
 */
async function AdminUpdateSubscriptionItem({
  subscriptionId,
  itemId,
  quantity,
} = {}) {
  const subscription = await Subscription.findById(subscriptionId);
  if (!subscription) return Response(false, "Subscription not found", null);
  return UpdateSubscriptionItem({
    customerId: String(subscription.customer),
    subscriptionId,
    itemId,
    quantity,
  });
}

/**
 * Admin: remove item.
 */
async function AdminRemoveSubscriptionItem({ subscriptionId, itemId } = {}) {
  const subscription = await Subscription.findById(subscriptionId);
  if (!subscription) return Response(false, "Subscription not found", null);
  return RemoveSubscriptionItem({
    customerId: String(subscription.customer),
    subscriptionId,
    itemId,
  });
}

/**
 * Admin: get subscription delivery schedule.
 */
async function AdminGetSubscriptionDeliveries({
  subscriptionId,
  page = 1,
  pageSize = 20,
} = {}) {
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

/**
 * Admin: get orders generated from a subscription.
 */
async function AdminGetSubscriptionOrders({
  subscriptionId,
  page = 1,
  pageSize = 20,
} = {}) {
  const total = await Order.countDocuments({ subscription: subscriptionId });
  const orders = await Order.find({ subscription: subscriptionId })
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();
  return Response(true, null, { orders, meta: { page, pageSize, total } });
}

module.exports = {
  AdminListSubscriptions,
  AdminGetSubscription,
  AdminPauseSubscription,
  AdminResumeSubscription,
  AdminCancelSubscription,
  AdminUpdateSubscription,
  AdminAddSubscriptionItem,
  AdminUpdateSubscriptionItem,
  AdminRemoveSubscriptionItem,
  AdminGetSubscriptionDeliveries,
  AdminGetSubscriptionOrders,
};
