"use strict";
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { reconcile } = require("./financialIndexes.cjs");
const EXPECTED_HEAD = "144badd63cb5263ad8eb89ce4f353816515f0fd4";
async function run(argv = process.argv.slice(2)) {
  const report = { readOnly: !argv.includes("--apply-indexes-only"), completed: false };
  let client;
  try {
    require("dotenv").config({ override: true, quiet: true });
    if (process.cwd() !== "/root/LWS-Scripts/Levants-server/server" || process.env.NODE_ENV !== "production" ||
      process.env.APP_ENV === "uat" || !process.env.MONGO_URI) throw Error("production_guard");
    const guard = () => {
      const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (head !== EXPECTED_HEAD) throw Error("production_head_changed");
      const disk = fs.statfsSync(".");
      const availableDisk = Number(disk.bavail) * Number(disk.bsize);
      const availableMemory = Number(fs.readFileSync("/proc/meminfo", "utf8").match(/^MemAvailable:\s+(\d+)/m)?.[1]) * 1024;
      if (availableDisk < 1024 ** 3 || !Number.isFinite(availableMemory) || availableMemory < 512 * 1024 ** 2) throw Error("resource_guard");
      report.productionHead = head;
      report.resourceChecksPassed = true;
    };
    guard();
    const { MongoClient } = require("mongoose").mongo;
    client = new MongoClient(process.env.MONGO_URI, { maxPoolSize: 2, serverSelectionTimeoutMS: 10000 });
    await client.connect();
    const db = client.db();
    if (/uat|test|rehearsal/i.test(db.databaseName)) throw Error("production_guard");
    const hello = await db.admin().command({ hello: 1 });
    if (!hello.isWritablePrimary || !hello.setName) throw Error("replica_set_guard");
    report.backup = "not_taken_index_only_scope";
    await reconcile(db, { apply: !report.readOnly, beforeWrite: guard, report });
    report.completed = true;
    report.verdict = report.readOnly ? "read_only_plan_ready" : "six_indexes_verified";
  } catch (e) {
    report.reason = /^(production_guard|production_head_changed|resource_guard|replica_set_guard|duplicates_require_review|conflicting_index_requires_review|index_verification_failed)$/.test(e.message) ? e.message : "operation_failed";
    report.errorCode = typeof e.code === "number" ? e.code : null;
  } finally { await client?.close(); }
  return report;
}
module.exports = { run };
if (require.main === module) run().then(report => { console.log(JSON.stringify(report)); if (!report.completed) process.exitCode = 1; });
