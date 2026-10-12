const mongoose = require("mongoose");

const Customer = require("../models/customer.model");
const StoreCreditTransaction = require("../models/storeCreditTransaction.model");

function toMinor(amount) {
  return Math.round(Number(amount) || 0);
}

function normalizeIdempotencyKey(value) {
  const key = String(value || "").trim();
  return key || null;
}

async function findExisting(customerId, idempotencyKey, session = null) {
  if (!idempotencyKey) return null;
  let query = StoreCreditTransaction.findOne({
    customer: customerId,
    idempotencyKey,
  });
  if (session) query = query.session(session);
  return query.exec();
}

async function runInTransaction(providedSession, work) {
  if (providedSession) return work(providedSession);

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function replayAfterDuplicate(customerId, idempotencyKey) {
  if (!idempotencyKey) return null;
  const transaction = await StoreCreditTransaction.findOne({
    customer: customerId,
    idempotencyKey,
  }).lean();
  if (!transaction) return null;
  return {
    ok: true,
    balance: transaction.balanceAfter,
    transaction,
    replayed: true,
  };
}

async function getBalance(customerId) {
  const customer = await Customer.findById(customerId)
    .select("creditBalance")
    .lean();
  return Number(customer?.creditBalance || 0);
}

async function addCredit({
  customerId,
  amountMinor,
  type,
  reason = null,
  subscriptionId = null,
  orderId = null,
  actorUserId = null,
  metadata = {},
  idempotencyKey = null,
  session = null,
} = {}) {
  const amount = toMinor(amountMinor);
  const key = normalizeIdempotencyKey(idempotencyKey);
  if (!customerId) return { ok: false, message: "customerId is required" };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Amount must be greater than zero" };
  }

  const execute = async (tx) => {
    const existing = await findExisting(customerId, key, tx);
    if (existing) {
      return {
        ok: true,
        balance: existing.balanceAfter,
        transaction: existing,
        replayed: true,
      };
    }

    const updated = await Customer.findByIdAndUpdate(
      customerId,
      { $inc: { creditBalance: amount } },
      { new: true, select: "creditBalance", session: tx },
    );
    if (!updated) return { ok: false, message: "Customer not found" };

    const [transaction] = await StoreCreditTransaction.create(
      [{
        customer: customerId,
        amount,
        balanceAfter: updated.creditBalance,
        type,
        reason,
        subscription: subscriptionId,
        order: orderId,
        actorUser: actorUserId,
        metadata,
        idempotencyKey: key,
      }],
      { session: tx },
    );

    return { ok: true, balance: updated.creditBalance, transaction };
  };

  try {
    return await runInTransaction(session, execute);
  } catch (error) {
    if (!session && key && error?.code === 11000) {
      const replay = await replayAfterDuplicate(customerId, key);
      if (replay) return replay;
    }
    throw error;
  }
}

async function redeemCredit({
  customerId,
  amountMinor,
  type = "order_redemption",
  reason = null,
  orderId = null,
  subscriptionId = null,
  actorUserId = null,
  metadata = {},
  idempotencyKey = null,
  session = null,
} = {}) {
  const amount = toMinor(amountMinor);
  const key = normalizeIdempotencyKey(idempotencyKey);
  if (!customerId) return { ok: false, message: "customerId is required" };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Amount must be greater than zero" };
  }

  const execute = async (tx) => {
    const existing = await findExisting(customerId, key, tx);
    if (existing) {
      return {
        ok: true,
        balance: existing.balanceAfter,
        transaction: existing,
        replayed: true,
      };
    }

    const updated = await Customer.findOneAndUpdate(
      { _id: customerId, creditBalance: { $gte: amount } },
      { $inc: { creditBalance: -amount } },
      { new: true, select: "creditBalance", session: tx },
    );
    if (!updated) return { ok: false, message: "Insufficient store credit" };

    const [transaction] = await StoreCreditTransaction.create(
      [{
        customer: customerId,
        amount: -amount,
        balanceAfter: updated.creditBalance,
        type,
        reason,
        order: orderId,
        subscription: subscriptionId,
        actorUser: actorUserId,
        metadata,
        idempotencyKey: key,
      }],
      { session: tx },
    );

    return { ok: true, balance: updated.creditBalance, transaction };
  };

  try {
    return await runInTransaction(session, execute);
  } catch (error) {
    if (!session && key && error?.code === 11000) {
      const replay = await replayAfterDuplicate(customerId, key);
      if (replay) return replay;
    }
    throw error;
  }
}

async function adjust({
  customerId,
  amountMinor,
  reason = null,
  actorUserId = null,
  idempotencyKey = null,
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
      idempotencyKey,
    });
  }

  const result = await redeemCredit({
    customerId,
    amountMinor: -amount,
    type: "admin_adjustment",
    reason,
    actorUserId,
    idempotencyKey,
  });
  if (!result.ok && result.message === "Insufficient store credit") {
    return {
      ok: false,
      message: "Cannot deduct more than the current balance",
    };
  }
  return result;
}

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
