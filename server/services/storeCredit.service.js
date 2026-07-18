const mongoose = require("mongoose");

const Customer = require("../models/customer.model");
const StoreCreditTransaction = require("../models/storeCreditTransaction.model");

/**
 * Store-credit (wallet) service. All amounts are in MINOR units (pence).
 *
 * The customer's `creditBalance` is the single source of truth and is mutated
 * atomically via `$inc`. Every mutation also writes an append-only ledger entry
 * (`StoreCreditTransaction`) capturing the resulting balance.
 */

function toMinor(amount) {
  return Math.round(Number(amount) || 0);
}

/**
 * Read a customer's current credit balance (pence).
 */
async function getBalance(customerId) {
  const customer = await Customer.findById(customerId)
    .select("creditBalance")
    .lean();
  return Number(customer?.creditBalance || 0);
}

/**
 * Add credit to a customer's balance and record a ledger entry.
 * Returns { ok, balance, transaction } or { ok:false, message }.
 */
async function addCredit({
  customerId,
  amountMinor,
  type,
  reason = null,
  subscriptionId = null,
  orderId = null,
  actorUserId = null,
  metadata = {},
} = {}) {
  const amount = toMinor(amountMinor);
  if (!customerId) return { ok: false, message: "customerId is required" };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Amount must be greater than zero" };
  }

  const updated = await Customer.findByIdAndUpdate(
    customerId,
    { $inc: { creditBalance: amount } },
    { new: true, select: "creditBalance" },
  );
  if (!updated) return { ok: false, message: "Customer not found" };

  const [transaction] = await StoreCreditTransaction.create([
    {
      customer: customerId,
      amount,
      balanceAfter: updated.creditBalance,
      type,
      reason,
      subscription: subscriptionId,
      order: orderId,
      actorUser: actorUserId,
      metadata,
    },
  ]);

  return { ok: true, balance: updated.creditBalance, transaction };
}

/**
 * Spend (deduct) credit from a customer's balance. Fails atomically if the
 * customer does not have enough credit. Returns { ok, balance, transaction }
 * or { ok:false, message }.
 */
async function redeemCredit({
  customerId,
  amountMinor,
  type = "order_redemption",
  reason = null,
  orderId = null,
  subscriptionId = null,
  actorUserId = null,
  metadata = {},
} = {}) {
  const amount = toMinor(amountMinor);
  if (!customerId) return { ok: false, message: "customerId is required" };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Amount must be greater than zero" };
  }

  // Atomic guard: only deduct if the balance can cover the amount.
  const updated = await Customer.findOneAndUpdate(
    { _id: customerId, creditBalance: { $gte: amount } },
    { $inc: { creditBalance: -amount } },
    { new: true, select: "creditBalance" },
  );
  if (!updated) return { ok: false, message: "Insufficient store credit" };

  const [transaction] = await StoreCreditTransaction.create([
    {
      customer: customerId,
      amount: -amount,
      balanceAfter: updated.creditBalance,
      type,
      reason,
      order: orderId,
      subscription: subscriptionId,
      actorUser: actorUserId,
      metadata,
    },
  ]);

  return { ok: true, balance: updated.creditBalance, transaction };
}

/**
 * Admin manual adjustment. `amountMinor` is signed: positive adds, negative
 * deducts. Deductions cannot take the balance below zero.
 */
async function adjust({
  customerId,
  amountMinor,
  reason = null,
  actorUserId = null,
} = {}) {
  const amount = toMinor(amountMinor);
  if (!Number.isFinite(amount) || amount === 0) {
    return { ok: false, message: "Adjustment amount must be non-zero" };
  }

  if (amount > 0) {
    return addCredit({
      customerId,
      amountMinor: amount,
      type: "admin_adjustment",
      reason,
      actorUserId,
    });
  }

  const result = await redeemCredit({
    customerId,
    amountMinor: -amount,
    type: "admin_adjustment",
    reason,
    actorUserId,
  });
  if (!result.ok && result.message === "Insufficient store credit") {
    return {
      ok: false,
      message: "Cannot deduct more than the current balance",
    };
  }
  return result;
}

/**
 * Paginated ledger history for a customer.
 */
async function listTransactions({ customerId, page = 1, pageSize = 20 } = {}) {
  if (!mongoose.isValidObjectId(customerId)) {
    return { transactions: [], meta: { page, pageSize, total: 0 } };
  }
  const skip = (page - 1) * pageSize;
  const [total, transactions] = await Promise.all([
    StoreCreditTransaction.countDocuments({ customer: customerId }),
    StoreCreditTransaction.find({ customer: customerId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
  ]);
  return { transactions, meta: { page, pageSize, total } };
}

module.exports = {
  getBalance,
  addCredit,
  redeemCredit,
  adjust,
  listTransactions,
};
