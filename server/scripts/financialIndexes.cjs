"use strict";
// Raw-driver operations only. No models, application startup, payments or notifications.
const specs = [
  ["paymentmethods", { customer: 1, provider: 1, providerReference: 1 }, "customer_1_provider_1_providerReference_1", "providerReference"],
  ["subscriptionmutations", { customer: 1, operationId: 1 }, "customer_1_operationId_1"],
  ["subscriptioninvoicefulfillments", { subscription: 1, invoiceId: 1 }, "subscription_1_invoiceId_1"],
  ["subscriptionstockreservations", { key: 1 }, "key_1"],
  ["payments", { subscriptionInvoiceKey: 1 }, "subscriptionInvoiceKey_1", "subscriptionInvoiceKey"],
  ["storecredittransactions", { customer: 1, idempotencyKey: 1 }, "customer_1_idempotencyKey_1", "idempotencyKey"],
];
function options([, , name, partial]) {
  return { name, unique: true, ...(partial ? { partialFilterExpression: { [partial]: { $type: "string" } } } : {}) };
}
function compatible(index, spec) {
  const expected = options(spec);
  return JSON.stringify(index.key) === JSON.stringify(spec[1]) && index.unique === true &&
    !index.sparse && !index.hidden && (!index.collation || index.collation.locale === "simple") &&
    JSON.stringify(index.partialFilterExpression) === JSON.stringify(expected.partialFilterExpression);
}
async function inspect(db, spec) {
  const [collection, keys, name, partial] = spec;
  const col = db.collection(collection);
  let indexes = [];
  try { indexes = await col.listIndexes().toArray(); } catch (e) { if (e.code !== 26) throw e; }
  const pipeline = [...(partial ? [{ $match: { [partial]: { $type: "string" } } }] : []),
    { $group: { _id: Object.fromEntries(Object.keys(keys).map(k => [k, "$" + k])), count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }, { $limit: 1 }];
  if ((await col.aggregate(pipeline, { maxTimeMS: 30000 }).toArray()).length) throw Error("duplicates_require_review");
  const named = indexes.find(i => i.name === name);
  if (named && !compatible(named, spec)) throw Error("conflicting_index_requires_review");
  return { collection, name, keys, partialFilterExpression: options(spec).partialFilterExpression || null,
    duplicateGroups: 0, alreadyPresent: indexes.some(i => compatible(i, spec)), created: false };
}
async function reconcile(db, { apply = false, beforeWrite = async () => {}, report = {} } = {}) {
  report.indexes = [];
  report.stage = "read_only_index_plan";
  // Validate every collection before the first write.
  for (const spec of specs) report.indexes.push(await inspect(db, spec));
  if (apply) {
    for (const [n, spec] of specs.entries()) {
      report.stage = "create_six_indexes";
      await beforeWrite();
      const fresh = await inspect(db, spec);
      if (!fresh.alreadyPresent) {
        await db.collection(spec[0]).createIndex(spec[1], { ...options(spec), maxTimeMS: 120000 });
        report.indexes[n].created = true;
      }
      report.stage = "verify_indexes";
      const indexes = await db.collection(spec[0]).listIndexes().toArray();
      report.indexes[n].verified = indexes.some(i => compatible(i, spec));
      if (!report.indexes[n].verified) throw Error("index_verification_failed");
    }
  }
  return report;
}
module.exports = { specs, options, compatible, inspect, reconcile };
