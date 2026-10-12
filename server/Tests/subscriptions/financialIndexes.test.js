"use strict";
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { specs, reconcile } = require("../../scripts/financialIndexes.cjs");
let db;
const fixtures = specs.map((spec, n) => Object.fromEntries(Object.keys(spec[1]).map(key => [key, `fixture-${n}-${key}`])));
beforeEach(async () => {
  db = mongoose.connection.getClient().db(`financial_indexes_test_${crypto.randomBytes(12).toString("hex")}`);
  for (const [n, spec] of specs.entries()) {
    await db.collection(spec[0]).insertOne({ ...fixtures[n] });
    if (spec[3]) {
      const excluded = { ...fixtures[n] };
      delete excluded[spec[3]];
      await db.collection(spec[0]).insertMany([{ ...excluded }, { ...excluded }]);
    }
  }
});
afterEach(async () => {
  if (db) {
    expect(db.databaseName).toMatch(/^financial_indexes_test_[a-f0-9]{24}$/);
    await db.dropDatabase();
  }
});
async function documents() {
  const result = [];
  for (const spec of specs) result.push(await db.collection(spec[0]).find({}).sort({ _id: 1 }).toArray());
  return JSON.stringify(result);
}
test("creates six exact indexes without changing documents, permits partial exclusions, and is idempotent", async () => {
  const prior = await documents();
  const report = await reconcile(db, { apply: true });
  expect(report.indexes).toHaveLength(6);
  expect(report.indexes.every(index => index.created && index.verified)).toBe(true);
  expect(await documents()).toBe(prior);
  for (const [n, spec] of specs.entries()) {
    await expect(db.collection(spec[0]).insertOne({ ...fixtures[n] })).rejects.toMatchObject({ code: 11000 });
  }
  const repeat = await reconcile(db, { apply: true });
  expect(repeat.indexes.every(index => index.alreadyPresent && !index.created && index.verified)).toBe(true);
  expect(await documents()).toBe(prior);
  const competing = await Promise.allSettled([1, 2].map(() => db.collection("subscriptionmutations").insertOne({ customer: "race", operationId: "same" })));
  expect(competing.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(competing.find(result => result.status === "rejected").reason.code).toBe(11000);
});
test("a duplicate in the last collection prevents all index writes", async () => {
  await db.collection(specs[5][0]).insertOne({ ...fixtures[5] });
  await expect(reconcile(db, { apply: true })).rejects.toThrow("duplicates_require_review");
  for (const spec of specs) expect(await db.collection(spec[0]).listIndexes().toArray()).toHaveLength(1);
});
test("refuses a conflicting existing index instead of dropping it", async () => {
  await db.collection(specs[0][0]).createIndex(specs[0][1], { name: specs[0][2] });
  await expect(reconcile(db, { apply: true })).rejects.toThrow("conflicting_index_requires_review");
  const indexes = await db.collection(specs[0][0]).listIndexes().toArray();
  expect(indexes.find(index => index.name === specs[0][2]).unique).not.toBe(true);
  for (const spec of specs.slice(1)) expect(await db.collection(spec[0]).listIndexes().toArray()).toHaveLength(1);
});
