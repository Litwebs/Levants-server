"use strict";
// Read-only incident probe. Run via stdin from the production server directory.
// Native driver only: no model hooks, application startup or database writes.
const fs = require("node:fs");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
require("dotenv").config({ override: true, quiet: true });
const { MongoClient } = require("mongoose").mongo;
const START = new Date("2026-10-17T23:00:00.000Z");
const END = new Date("2026-10-18T23:00:00.000Z");
const SINCE = new Date("2026-10-10T00:00:00.000Z");
const CAP = 5000;
const report = { readOnly: true, completed: false, deliveryDate: "2026-10-18", timezone: "Europe/London" };
let client;
let stage = "guard";
const timer = setTimeout(() => { console.log(JSON.stringify({ readOnly: true, completed: false, stage, reason: "time_limit" })); process.exit(1); }, 120000);
const id = value => value == null ? null : String(value);
async function read(db, collection, query, projection, cap = CAP) {
  const rows = await db.collection(collection).find(query, { projection, maxTimeMS: 15000 }).limit(cap + 1).toArray();
  if (rows.length > cap) throw new Error("bounded_read_limit");
  return rows;
}
function sourceEvidence(path) {
  const source = fs.readFileSync(path, "utf8");
  return { path, sha256: crypto.createHash("sha256").update(source).digest("hex"),
    usesReserveStock: /\.reserveStock\(|await reserveStock\(/.test(source),
    usesConsumeStock: /\.consumeStock\(|await consumeStock\(/.test(source),
    usesUpdateRecurringInventory: /updateRecurringInventory\(/.test(source) };
}
async function main() {
  if (process.env.NODE_ENV !== "production" || process.env.APP_ENV === "uat" || !process.env.MONGO_URI) throw new Error("environment_guard");
  report.deployedRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  report.source = ["services/subscriptions/subscriptionWebhook.service.js", "services/customerPortal/customerSubscriptions.service.js", "services/subscriptions/subscriptionOrderStock.service.js", "services/orders/orders.public.service.js"].map(sourceEvidence);
  client = new MongoClient(process.env.MONGO_URI, { maxPoolSize: 1, serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, appName: "bread-stock-read-only-20261018" });
  await client.connect();
  const db = client.db();
  if (/uat|test|rehearsal/i.test(db.databaseName)) throw new Error("environment_guard");
  stage = "products";
  const nameMatch = /sour\s*dough|white/i;
  const products = await read(db, "products", { $or: [{ name: nameMatch }, { slug: /sourdough|white-bread|white-loaf/i }] }, { _id: 1, name: 1, status: 1 }, 100);
  const variants = await read(db, "productvariants", { $or: [{ product: { $in: products.map(p => p._id) } }, { name: nameMatch }, { sku: /sourdough|white-bread|white-loaf/i }] }, { _id: 1, product: 1, name: 1, sku: 1, stockQuantity: 1, reservedQuantity: 1, status: 1, createdAt: 1, updatedAt: 1 }, 100);
  if (!variants.length) throw new Error("no_matching_variants");
  const variantIds = variants.map(v => v._id);
  const variantStrings = variantIds.map(String);
  const matches = item => variantStrings.includes(id(item.variant));
  const items = list => (list || []).filter(matches).map(i => ({ variant: id(i.variant), quantity: Number(i.quantity || 0), addOn: Boolean(i.isSubscriptionAddOn) }));
  const parents = await read(db, "products", { _id: { $in: variants.map(v => v.product) } }, { name: 1 }, 100);
  report.variants = variants.map(v => ({ variantId: id(v._id), product: parents.find(p => id(p._id) === id(v.product))?.name || null, name: v.name, sku: v.sku, status: v.status, stock: v.stockQuantity, reserved: v.reservedQuantity, available: Number(v.stockQuantity || 0) - Number(v.reservedQuantity || 0), createdAt: v.createdAt, updatedAt: v.updatedAt }));
  stage = "orders";
  const orders = await read(db, "orders", { "items.variant": { $in: variantIds }, $or: [{ deliveryDate: { $gte: SINCE } }, { createdAt: { $gte: SINCE } }] }, { _id: 1, orderId: 1, subscription: 1, orderType: 1, items: 1, subscriptionStockItems: 1, subscriptionAddOnStockItems: 1, subscriptionStockToRestore: 1, status: 1, deliveryStatus: 1, deliveryDate: 1, archived: 1, createdAt: 1, updatedAt: 1, paidAt: 1 });
  const reservations = await read(db, "subscriptionstockreservations", { $or: [{ "items.variant": { $in: variantStrings } }, { "items.variant": { $in: variantIds } }] }, { _id: 1, subscription: 1, state: 1, key: 1, items: 1, remaining: 1, consumptions: 1, createdAt: 1, updatedAt: 1 });
  const pending = await read(db, "orders", { status: "pending", archived: { $ne: true }, "items.variant": { $in: variantIds } }, { items: 1 });
  report.reservationReconciliation = variants.map(v => {
    const qty = list => items(list).filter(i => i.variant === id(v._id)).reduce((n, i) => n + i.quantity, 0);
    const pendingUnits = pending.reduce((n, o) => n + qty(o.items), 0);
    const heldUnits = reservations.filter(r => r.state === "held").reduce((n, r) => n + qty(r.remaining), 0);
    return { variantId: id(v._id), reserved: v.reservedQuantity, pendingUnits, heldUnits, expectedReserved: pendingUnits + heldUnits, drift: Number(v.reservedQuantity || 0) - pendingUnits - heldUnits };
  });
  report.orders = orders.map(o => ({ orderId: o.orderId, orderDbId: id(o._id), subscriptionId: id(o.subscription), type: o.orderType, date: o.deliveryDate, status: o.status, deliveryStatus: o.deliveryStatus, archived: o.archived === true, createdAt: o.createdAt, updatedAt: o.updatedAt, paidAt: o.paidAt, items: items(o.items), recurringStockProof: items(o.subscriptionStockItems), addOnStockProof: items(o.subscriptionAddOnStockItems), stockToRestore: items(o.subscriptionStockToRestore), targetDate: o.deliveryDate >= START && o.deliveryDate < END }));
  report.reservations = reservations.map(r => ({ reservationId: id(r._id), subscriptionId: id(r.subscription), kind: String(r.key).split(":")[0], state: r.state, items: items(r.items), remaining: items(r.remaining), consumed: (r.consumptions || []).map(c => ({ orderId: orders.find(o => id(o._id) === c.key)?.orderId || null, items: items(c.items) })), createdAt: r.createdAt, updatedAt: r.updatedAt }));
  stage = "delivery_slots";
  const slots = await read(db, "subscriptiondeliveries", { scheduledDate: { $gte: START, $lt: END } }, { subscription: 1, order: 1, scheduledDate: 1, status: 1, addOns: 1, createdAt: 1, updatedAt: 1 });
  const subscriptions = await read(db, "subscriptions", { $or: [{ _id: { $in: slots.map(s => s.subscription) } }, { "items.variant": { $in: variantIds } }, { "deliveryDayPlans.items.variant": { $in: variantIds } }] }, { _id: 1, subscriptionNumber: 1, status: 1, items: 1, deliveryDayPlans: 1, pendingChanges: 1, createdAt: 1, updatedAt: 1 });
  report.targetDeliveries = slots.map(s => {
    const sub = subscriptions.find(t => id(t._id) === id(s.subscription));
    const plan = sub?.deliveryDayPlans?.find(p => Number(p.day) === 0);
    const recurring = items(plan?.items?.length ? plan.items : sub?.items);
    const addOns = items((s.addOns || []).flatMap(a => a.items || []));
    return { slotId: id(s._id), subscriptionId: id(s.subscription), subscriptionNumber: sub?.subscriptionNumber, subscriptionStatus: sub?.status, orderDbId: id(s.order), status: s.status, recurring, addOns, createdAt: s.createdAt, updatedAt: s.updatedAt };
  }).filter(s => s.recurring.length || s.addOns.length || orders.some(o => id(o._id) === s.orderDbId));
  report.subscriptions = subscriptions.map(s => ({ subscriptionId: id(s._id), number: s.subscriptionNumber, status: s.status, items: items(s.items), dayPlans: (s.deliveryDayPlans || []).map(p => ({ day: p.day, items: items(p.items) })).filter(p => p.items.length), pendingChanges: s.pendingChanges ? { effectiveFrom: s.pendingChanges.effectiveFrom, items: items(s.pendingChanges.items) } : null, createdAt: s.createdAt, updatedAt: s.updatedAt }));
  stage = "mutations";
  const mutations = await read(db, "subscriptionmutations", { subscription: { $in: subscriptions.map(s => s._id) }, createdAt: { $gte: new Date("2026-10-10T00:00:00Z") } }, { subscription: 1, mutationType: 1, status: 1, createdAt: 1, updatedAt: 1, completedAt: 1, "creationSnapshot.inventoryKey": 1, "itemIncreaseSnapshot.inventoryKey": 1, "itemIncreaseSnapshot.inventoryItems": 1, "decreaseRefundSnapshot.orderPlans": 1, "addOnSnapshot.inventoryKey": 1, "addOnSnapshot.inventoryItems": 1 });
  report.mutations = mutations.map(m => ({ subscriptionId: id(m.subscription), type: m.mutationType, status: m.status, createdAt: m.createdAt, updatedAt: m.updatedAt, completedAt: m.completedAt, creationHasInventoryKey: Boolean(m.creationSnapshot?.inventoryKey), increaseHasInventoryKey: Boolean(m.itemIncreaseSnapshot?.inventoryKey), increaseItems: items(m.itemIncreaseSnapshot?.inventoryItems), addOnHasInventoryKey: Boolean(m.addOnSnapshot?.inventoryKey), addOnItems: items(m.addOnSnapshot?.inventoryItems), decreaseOrderPlanCount: m.decreaseRefundSnapshot?.orderPlans?.length || 0 }));
  report.targetTotals = variants.map(v => {
    const target = report.orders.filter(o => o.targetDate && !o.archived && ["paid", "partially_paid", "partially_refunded"].includes(o.status));
    const quantity = list => list.filter(i => i.variant === id(v._id)).reduce((n, i) => n + i.quantity, 0);
    return { variantId: id(v._id), paidOrderUnits: target.reduce((n, o) => n + quantity(o.items), 0), unpaidOrderUnits: report.orders.filter(o => o.targetDate && !o.archived && o.status === "unpaid").reduce((n, o) => n + quantity(o.items), 0), recurringProofUnits: target.reduce((n, o) => n + quantity(o.recurringStockProof), 0), addOnProofUnits: target.reduce((n, o) => n + quantity(o.addOnStockProof), 0), ungeneratedScheduledUnits: report.targetDeliveries.filter(s => !s.orderDbId && ["scheduled", "rescheduled"].includes(s.status)).reduce((n, s) => n + quantity(s.recurring) + quantity(s.addOns), 0) };
  });
  report.completed = true;
  report.observedAt = new Date().toISOString();
  console.log(JSON.stringify(report));
}
main().catch(e => { console.log(JSON.stringify({ readOnly: true, completed: false, stage, reason: ["environment_guard", "bounded_read_limit", "no_matching_variants"].includes(e.message) ? e.message : "read_failed", errorCode: typeof e.code === "number" ? e.code : null })); process.exitCode = 1; }).finally(async () => { clearTimeout(timer); await client?.close(); });
