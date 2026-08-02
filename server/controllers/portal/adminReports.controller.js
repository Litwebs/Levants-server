"use strict";

const Customer = require("../../models/customer.model");
const Order = require("../../models/order.model");
const Subscription = require("../../models/subscription.model");
const SubscriptionDelivery = require("../../models/subscriptionDelivery.model");
const Payment = require("../../models/payment.model");
const SupportRequest = require("../../models/supportRequest.model");
const { sendOk } = require("../../utils/response.util");

const CustomerPortalSummary = async (req, res) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const [
    totalCustomers,
    newCustomers30Days,
    totalOneTimeOrders,
    activeSubscriptions,
    pausedSubscriptions,
    cancelledSubscriptions,
    upcomingDeliveries,
    ordersToday,
    pendingPayments,
    openSupportRequests,
  ] = await Promise.all([
    Customer.countDocuments({ isGuest: false }),
    Customer.countDocuments({
      isGuest: false,
      createdAt: { $gte: thirtyDaysAgo },
    }),
    Order.countDocuments({ orderType: "one_time" }),
    Subscription.countDocuments({ status: "active" }),
    Subscription.countDocuments({ status: "paused" }),
    Subscription.countDocuments({ status: "cancelled" }),
    SubscriptionDelivery.countDocuments({
      status: "scheduled",
      scheduledDate: { $gte: now },
    }),
    Order.countDocuments({
      deliveryDate: { $gte: todayStart, $lte: todayEnd },
    }),
    Payment.countDocuments({ status: "pending" }),
    SupportRequest.countDocuments({ status: { $in: ["open", "in_review"] } }),
  ]);

  return sendOk(res, {
    totalCustomers,
    newCustomers30Days,
    totalOneTimeOrders,
    subscriptions: {
      active: activeSubscriptions,
      paused: pausedSubscriptions,
      cancelled: cancelledSubscriptions,
    },
    upcomingDeliveries,
    ordersToday,
    pendingPayments,
    openSupportRequests,
  });
};

const SubscriptionsSummary = async (req, res) => {
  const [
    activeCount,
    pausedCount,
    cancelledCount,
    weeklyCount,
    biWeeklyCount,
    monthlyCount,
  ] = await Promise.all([
    Subscription.countDocuments({ status: "active" }),
    Subscription.countDocuments({ status: "paused" }),
    Subscription.countDocuments({ status: "cancelled" }),
    Subscription.countDocuments({ frequency: "weekly" }),
    Subscription.countDocuments({ frequency: "every_two_weeks" }),
    Subscription.countDocuments({ frequency: "monthly" }),
  ]);

  // Top subscription products
  const topProducts = await Subscription.aggregate([
    { $match: { status: "active" } },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.variant",
        name: { $first: "$items.name" },
        sku: { $first: "$items.sku" },
        totalQuantity: { $sum: "$items.quantity" },
        subscriptionCount: { $sum: 1 },
      },
    },
    { $sort: { subscriptionCount: -1 } },
    { $limit: 10 },
  ]);

  return sendOk(res, {
    status: {
      active: activeCount,
      paused: pausedCount,
      cancelled: cancelledCount,
    },
    frequency: {
      weekly: weeklyCount,
      every_two_weeks: biWeeklyCount,
      monthly: monthlyCount,
    },
    topProducts,
  });
};

const DeliveriesSummary = async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [scheduled, today, next7, failed] = await Promise.all([
    SubscriptionDelivery.countDocuments({ status: "scheduled" }),
    SubscriptionDelivery.countDocuments({
      scheduledDate: { $gte: todayStart, $lte: todayEnd },
    }),
    SubscriptionDelivery.countDocuments({
      status: "scheduled",
      scheduledDate: { $gte: now, $lte: next7Days },
    }),
    SubscriptionDelivery.countDocuments({ status: "failed" }),
  ]);

  return sendOk(res, {
    scheduled,
    today,
    next7Days: next7,
    failed,
  });
};

module.exports = {
  CustomerPortalSummary,
  SubscriptionsSummary,
  DeliveriesSummary,
};
