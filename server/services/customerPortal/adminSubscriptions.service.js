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
  sortBy = "newest",
  page = 1,
  pageSize = 20,
} = {}) {
  const filter = {};
  if (status && status !== "pending") filter.status = status;
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

  let subscriptions = [];
  if (status !== "pending") {
    subscriptions = await Subscription.find(filter)
      .populate("customer", "firstName lastName email phone")
      .sort({ createdAt: -1 })
      .lean();
  }

  const pendingFilter = {
    pendingSubscriptionDraft: { $ne: null },
  };
  if (search) {
    const regex = new RegExp(search, "i");
    pendingFilter.$or = [
      { firstName: regex },
      { lastName: regex },
      { email: regex },
    ];
  }

  let pendingSubscriptions = [];
  if (!status || status === "pending") {
    const pendingCustomers = await Customer.find(pendingFilter)
      .select(
        "firstName lastName email phone pendingSubscriptionDraft portalInviteSentAt portalInviteTokenExpiresAt createdAt updatedAt",
      )
      .lean();

    const dayIndexes = new Map([
      ["Sunday", 0],
      ["Monday", 1],
      ["Tuesday", 2],
      ["Wednesday", 3],
      ["Thursday", 4],
      ["Friday", 5],
      ["Saturday", 6],
    ]);

    pendingSubscriptions = pendingCustomers
      .map((customer) => {
        const draft = customer.pendingSubscriptionDraft || {};
        const draftFrequency =
          draft.frequency === "fortnightly"
            ? "every_two_weeks"
            : draft.frequency || "weekly";
        const days = Array.isArray(draft.deliveryDays)
          ? draft.deliveryDays
              .map((day) => dayIndexes.get(day))
              .filter((day) => Number.isInteger(day))
          : [];
        const quantities =
          draft.quantities && typeof draft.quantities === "object"
            ? draft.quantities
            : {};
        return {
          _id: `pending:${customer._id}`,
          subscriptionNumber: "Pending setup",
          customer: {
            _id: customer._id,
            firstName: customer.firstName,
            lastName: customer.lastName,
            email: customer.email,
            phone: customer.phone || null,
          },
          status: "pending",
          frequency: draftFrequency,
          preferredDeliveryDay: days[0] ?? 0,
          preferredDeliveryDays: days,
          nextDeliveryDate: null,
          startDate: null,
          items: Object.entries(quantities).map(
            ([variant, quantity], index) => ({
              _id: `pending-item:${index}`,
              variant,
              quantity,
            }),
          ),
          createdAt:
            customer.portalInviteSentAt ||
            customer.updatedAt ||
            customer.createdAt,
          updatedAt: customer.updatedAt,
          setupExpiresAt: customer.portalInviteTokenExpiresAt || null,
          isPendingSetup: true,
        };
      })
      .filter(
        (subscription) =>
          !frequency || subscription.frequency === frequency,
      );
  }

  const combined = [...subscriptions, ...pendingSubscriptions].sort((a, b) => {
    if (sortBy === "oldest") {
      return (
        new Date(a.createdAt || 0).getTime() -
        new Date(b.createdAt || 0).getTime()
      );
    }
    if (sortBy === "next-delivery") {
      const aTime = a.nextDeliveryDate
        ? new Date(a.nextDeliveryDate).getTime()
        : Number.POSITIVE_INFINITY;
      const bTime = b.nextDeliveryDate
        ? new Date(b.nextDeliveryDate).getTime()
        : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    }
    return (
      new Date(b.createdAt || 0).getTime() -
      new Date(a.createdAt || 0).getTime()
    );
  });
  const total = combined.length;
  const paginatedSubscriptions = combined.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  return Response(true, null, {
    subscriptions: paginatedSubscriptions,
    meta: { page, pageSize, total },
  });
}

/**
 * Get single subscription (admin).
 */
async function AdminGetSubscription({ subscriptionId } = {}) {
  if (String(subscriptionId || "").startsWith("pending:")) {
    const customerId = String(subscriptionId).slice("pending:".length);
    const customer = await Customer.findOne({
      _id: customerId,
      pendingSubscriptionDraft: { $ne: null },
    })
      .select(
        "firstName lastName email phone addresses pendingSubscriptionDraft portalInviteSentAt portalInviteTokenExpiresAt createdAt updatedAt",
      )
      .lean();

    if (!customer) return Response(false, "Pending subscription not found", null);

    const draft = customer.pendingSubscriptionDraft || {};
    const selectedVariantIds = Array.isArray(draft.selectedVariantIds)
      ? draft.selectedVariantIds.map(String)
      : Object.keys(draft.quantities || {});
    const variants = await ProductVariant.find({
      _id: { $in: selectedVariantIds },
    })
      .populate("thumbnailImage", "url")
      .select("product name sku price thumbnailImage")
      .lean();
    const variantById = new Map(
      variants.map((variant) => [String(variant._id), variant]),
    );
    const items = selectedVariantIds
      .map((variantId, index) => {
        const variant = variantById.get(variantId);
        if (!variant) return null;
        return {
          _id: `pending-item:${index}`,
          product: String(variant.product),
          variant: variantId,
          name: variant.name,
          sku: variant.sku,
          quantity: Number(draft.quantities?.[variantId] || 1),
          unitPrice: Number(variant.price || 0),
          imageUrl: variant.thumbnailImage?.url || null,
        };
      })
      .filter(Boolean);

    const dayIndexes = new Map([
      ["Sunday", 0],
      ["Monday", 1],
      ["Tuesday", 2],
      ["Wednesday", 3],
      ["Thursday", 4],
      ["Friday", 5],
      ["Saturday", 6],
    ]);
    const preferredDeliveryDays = Array.isArray(draft.deliveryDays)
      ? draft.deliveryDays
          .map((day) => dayIndexes.get(day))
          .filter((day) => Number.isInteger(day))
      : [];
    const selectedAddress = (customer.addresses || []).find(
      (address) => String(address._id) === String(draft.selectedAddress || ""),
    );
    const deliveryAddress =
      selectedAddress ||
      (customer.addresses || []).find((address) => address.isDefault) ||
      (customer.addresses || [])[0] ||
      null;

    return Response(true, null, {
      subscription: {
        _id: `pending:${customer._id}`,
        subscriptionNumber: "Pending setup",
        customer: {
          _id: customer._id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone || null,
        },
        status: "pending",
        frequency:
          draft.frequency === "fortnightly"
            ? "every_two_weeks"
            : draft.frequency || "weekly",
        preferredDeliveryDay: preferredDeliveryDays[0] ?? 0,
        preferredDeliveryDays,
        nextDeliveryDate: null,
        startDate: null,
        items,
        deliveryAddress,
        notes: draft.notes || "",
        createdAt:
          customer.portalInviteSentAt || customer.updatedAt || customer.createdAt,
        updatedAt: customer.updatedAt,
        setupExpiresAt: customer.portalInviteTokenExpiresAt || null,
        isPendingSetup: true,
      },
    });
  }

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
  const defaultResumeOn = new Date();
  defaultResumeOn.setDate(defaultResumeOn.getDate() + 28);
  return PauseSubscription({
    customerId: String(subscription.customer),
    subscriptionId,
    resumeOn: defaultResumeOn.toISOString().slice(0, 10),
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
 * Admin: delete an uncompleted subscription setup without deleting the customer.
 */
async function AdminDeletePendingSubscription({ subscriptionId } = {}) {
  const normalizedId = String(subscriptionId || "");
  if (!normalizedId.startsWith("pending:")) {
    return Response(
      false,
      "Only pending subscription setups can be deleted",
      null,
    );
  }

  const customerId = normalizedId.slice("pending:".length);
  const customer = await Customer.findOneAndUpdate(
    {
      _id: customerId,
      pendingSubscriptionDraft: { $ne: null },
    },
    {
      $set: {
        pendingSubscriptionDraft: null,
        portalInviteTokenHash: null,
        portalInviteTokenExpiresAt: null,
        portalInviteSentAt: null,
      },
    },
    { new: true },
  )
    .select("_id firstName lastName email")
    .lean();

  if (!customer) {
    return Response(false, "Pending subscription not found", null);
  }

  return Response(true, "Pending subscription setup deleted", {
    customer,
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
  AdminDeletePendingSubscription,
  AdminGetSubscriptionDeliveries,
  AdminGetSubscriptionOrders,
};
