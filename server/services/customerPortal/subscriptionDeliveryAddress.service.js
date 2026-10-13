"use strict";
const mongoose = require("mongoose");
const Order = require("../../models/order.model");
const { geocodeAddress } = require("../../Integration/google.geocode");
const clock = require("../../utils/subscriptionClock.util");
const { computeSubscriptionCutoffDate, startOfDayInTimeZone } = require("../../utils/subscriptionCutoff.util");

async function locateDeliveryAddress(address) {
  const location = await geocodeAddress(address);
  if (!Number.isFinite(location?.lat) || !Number.isFinite(location?.lng) ||
      Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) {
    throw new Error("Invalid address coordinates");
  }
  return location;
}

function canChangeOrderAddress(order, settings, effectiveFrom, now) {
  if (!["paid", "partially_refunded"].includes(order.status) || order.deliveryStatus !== "ordered") return false;
  const date = new Date(order.deliveryDate).getTime();
  if (!order.deliveryDate || !Number.isFinite(date) || date < Math.max(startOfDayInTimeZone(now).getTime(), startOfDayInTimeZone(effectiveFrom).getTime())) return false;
  const cutoff = computeSubscriptionCutoffDate(order.deliveryDate, settings);
  return !cutoff || now < cutoff.getTime();
}

async function saveSubscriptionDeliveryAddress({ subscription, address, location, settings, effectiveFrom, session }) {
  let updated = 0;
  const apply = async session => {
      updated = 0;
      const now = clock.now();
      const orders = await Order.find({ subscription: subscription._id, customer: subscription.customer,
        status: { $in: ["paid", "partially_refunded"] }, deliveryStatus: "ordered",
        deliveryDate: { $gte: new Date(Math.max(startOfDayInTimeZone(now).getTime(), startOfDayInTimeZone(effectiveFrom).getTime())) },
      }).session(session);
      await subscription.save({ session });
      for (const order of orders) {
        if (!canChangeOrderAddress(order, settings, effectiveFrom, now)) continue;
        order.deliveryAddress = address;
        order.location = location;
        order.customerInstructions = address.deliveryInstructions || "";
        await order.save({ session });
        updated += 1;
      }
  };
  if (session) await apply(session);
  else await mongoose.connection.transaction(apply);
  return updated;
}
module.exports = { locateDeliveryAddress, canChangeOrderAddress, saveSubscriptionDeliveryAddress };
