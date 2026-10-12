"use strict";
const Plan = require("../../models/subscriptionInvoiceFulfillment.model");
async function freezeInvoiceFulfillment({ subscriptionId, invoiceId, build }) {
  const identity = { subscription: subscriptionId, invoiceId };
  const existing = await Plan.findOne(identity).lean();
  if (existing) return existing;
  // Complete every snapshot before creating the first order. A partially
  // applied invoice must never be reconstructed from a changed customer plan.
  const proposed = await build();
  try {
    return await Plan.findOneAndUpdate(identity, { $setOnInsert: { ...identity, ...proposed } },
      { upsert: true, new: true, runValidators: true }).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    const winner = await Plan.findOne(identity).lean();
    if (!winner) throw error;
    return winner;
  }
}
module.exports = { freezeInvoiceFulfillment };
