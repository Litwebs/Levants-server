"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");
const mongoose = require("mongoose");
const ownership = new AsyncLocalStorage();
const LEASE_MS = 120000;

function leaseLost() {
  return Object.assign(new Error("This worker no longer owns the subscription or card lease. Retry the original operation."),
    { statusCode: 503, code: "SUBSCRIPTION_LEASE_LOST" });
}

function withLease(lease, execute) {
  // Mongoose queries execute when awaited. Adopt thenables inside the lease
  // context so returning a lazy query cannot move its write outside the fence.
  return ownership.run([...(ownership.getStore() || []), lease], async () => await execute());
}

// Touch the owned row in the SAME transaction as the protected write. A
// takeover changes that row, so Mongo cannot commit a stale worker's write.
// This is stronger than a separate read/check followed by a write.
async function fenceLease(session) {
  for (const lease of ownership.getStore() || []) {
    const now = new Date();
    const customer = lease.kind === "customer";
    const mutation = lease.kind === "mutation";
    const collection = mongoose.model(mutation ? "SubscriptionMutation" : customer ? "Customer" : "Subscription").collection;
    const id = mongoose.Types.ObjectId.isValid(lease.id) ? new mongoose.Types.ObjectId(lease.id) : lease.id;
    const filter = mutation ? { _id: id, workerToken: lease.token,
      lockedAt: { $gt: new Date(now.getTime() - LEASE_MS) } } : customer
      ? { _id: id, "paymentMethodLock.token": lease.token,
          "paymentMethodLock.expiresAt": { $gt: now } }
      : { _id: id, "customerMutationLock.operationId": lease.token,
          "customerMutationLock.lockedAt": { $gt: new Date(now.getTime() - LEASE_MS) } };
    const update = mutation ? { $set: { lockedAt: now } } : customer
      ? { $set: { "paymentMethodLock.expiresAt": new Date(now.getTime() + LEASE_MS) } }
      : { $set: { "customerMutationLock.lockedAt": now } };
    const result = await collection.updateOne(filter, update, { ...(session ? { session } : {}) });
    if (result.matchedCount !== 1) throw leaseLost();
  }
}

// Existing explicit transactions retain their boundaries. A standalone write
// gets a short transaction containing its lease fence and its actual write.
// Reads and operations outside a leased workflow are unaffected.
function leaseFencingPlugin(schema) {
  const writes = new WeakMap();
  async function finish(target, error, result) {
    const state = writes.get(target);
    if (!state) return;
    writes.delete(target);
    if (!state.ownsSession) return;
    try {
      if (error) await state.session.abortTransaction();
      else await state.session.commitTransaction();
    } catch (failure) {
      if (state.session.inTransaction()) await state.session.abortTransaction().catch(() => {});
      throw failure;
    } finally {
      if (typeof target.$session === "function") target.$session(state.previousSession);
      else target.setOptions({ session: state.previousSession });
      if (result && typeof result.$session === "function") result.$session(state.previousSession);
      await state.session.endSession();
    }
  }
  async function begin() {
    if (!ownership.getStore()?.length) return;
    const previousSession = typeof this.$session === "function" ? this.$session() : this.getOptions().session;
    const ownsSession = !previousSession?.inTransaction();
    const session = ownsSession ? await mongoose.startSession() : previousSession;
    if (ownsSession) session.startTransaction();
    writes.set(this, { session, ownsSession, previousSession });
    if (typeof this.$session === "function") this.$session(session);
    else this.session(session);
    try { await fenceLease(session); }
    catch (error) { await finish(this, error); throw error; }
  }
  for (const method of ["save", "updateOne", "updateMany", "findOneAndUpdate", "deleteOne", "deleteMany", "findOneAndDelete", "replaceOne"]) {
    schema.pre(method, begin);
    schema.post(method, async function (result) { await finish(this, null, result); });
    schema.post(method, { errorHandler: true }, async function (error, result) {
      // Mongoose 9 awaits an async hook's returned promise. Calling next(error)
      // as well would reject a second, unobserved callback promise.
      await finish(this, error, result);
      throw error;
    });
  }
}

module.exports = { withLease, fenceLease, leaseFencingPlugin };
