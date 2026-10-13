const mongoose = require("mongoose");
const Order = require("../models/order.model");
const ProductVariant = require("../models/variant.model");

// Package refunds must restore each component once even when Stripe responds
// after its webhook. Existing UAT handling stays in place for ordinary orders.
async function persistDealRefund({ order, refund, refundRecord, paymentIntentId, adminUserId, reason, restock, mappedStatus, computeRefundDerivedOrderStatus }) {
  await mongoose.connection.transaction(async session => {
      const latest = await Order.findById(order._id).session(session);
      if (!latest) throw new Error("Order no longer exists");
      const previousStatus = latest.status;
      latest.stripePaymentIntentId ||= paymentIntentId;
      latest.refunds = Array.isArray(latest.refunds) ? latest.refunds : [];
      const existing = latest.refunds.find(record => record.stripeRefundId === refund.id);
      const alreadyRestocked = Boolean(latest.metadata?.refundRestockedAt) || (previousStatus === "refunded" && existing?.restock === true);
      if (!existing) latest.refunds.push(refundRecord);
      else {
        existing.restock = existing.restock || Boolean(restock);
        if (existing.status !== "succeeded") Object.assign(existing, refundRecord);
      }
      latest.refund = {
        ...(latest.refund || {}), refundedBy: adminUserId, reason: reason || null,
        restock: Boolean(restock), stripeRefundId: refund.id,
        refundedAt: mappedStatus === "succeeded" ? new Date() : latest.refund?.refundedAt,
      };
      latest.status = computeRefundDerivedOrderStatus(latest);
      if (Boolean(restock) && latest.status === "refunded" && !alreadyRestocked) {
        for (const item of latest.items) {
          await ProductVariant.findByIdAndUpdate(item.variant, { $inc: { stockQuantity: item.quantity } }, { session });
        }
        latest.metadata = { ...(latest.metadata || {}), refundRestockedAt: new Date().toISOString() };
      }
      await latest.save({ session });
    });
}

module.exports = { persistDealRefund };
