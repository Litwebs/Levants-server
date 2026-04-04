#!/usr/bin/env node

/**
 * Bulk dispatch email test script for Resend
 *
 * What it does:
 * - sends N emails (default 300)
 * - spreads them across a small list of recipient emails
 * - sends in chunks of 100 using resend.batch.send(...)
 * - uses your existing template system
 * - prints success/failure summary
 *
 * Recommended for testing:
 *   delivered+1@resend.dev
 *   delivered+2@resend.dev
 *   delivered+3@resend.dev
 *   delivered+4@resend.dev
 *   delivered+5@resend.dev
 *   delivered+6@resend.dev
 *
 * Usage examples:
 *   node scripts/test-dispatch-bulk.js
 *   node scripts/test-dispatch-bulk.js --count=300
 *   node scripts/test-dispatch-bulk.js --count=300 --dry-run=true
 *   node scripts/test-dispatch-bulk.js --emails=delivered+1@resend.dev,delivered+2@resend.dev
 */

require("dotenv").config();

const path = require("path");
const { sendBatchEmails } = require(
  path.join(__dirname, "../Integration/Email.service"),
);

const DEFAULT_EMAILS = [
  "delivered+1@resend.dev",
  "delivered+2@resend.dev",
  "delivered+3@resend.dev",
  "delivered+4@resend.dev",
  "delivered+5@resend.dev",
  "delivered+6@resend.dev",
];

function parseArgs(argv = []) {
  const out = {};

  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const idx = arg.indexOf("=");
    if (idx === -1) {
      out[arg.slice(2)] = true;
      continue;
    }
    const key = arg.slice(2, idx);
    const value = arg.slice(idx + 1);
    out[key] = value;
  }

  return out;
}

function toBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  const s = String(v || "")
    .trim()
    .toLowerCase();
  if (!s) return fallback;
  return ["1", "true", "yes", "y"].includes(s);
}

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function getRecipientList(args) {
  const raw = String(args.emails || "").trim();
  if (!raw) return DEFAULT_EMAILS;

  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildJob(index, to, batchLabel) {
  const orderNumber = `TEST-${batchLabel}-${String(index + 1).padStart(4, "0")}`;
  const slotStart = index % 2 === 0 ? "09:00" : "13:00";
  const slotEnd = index % 2 === 0 ? "11:00" : "15:00";

  return {
    orderDbId: `test-order-${index + 1}`,
    orderId: orderNumber,
    to,
    subject: `Dispatch test ${orderNumber}`,
    template: "orderDispatched",
    templateParams: {
      name: `Test Customer ${index + 1}`,
      orderId: orderNumber,
      deliveryDate: "Sat, 04 Apr 2026",
      etaWindowStart: slotStart,
      etaWindowEnd: slotEnd,
    },
    options: {
      fromName: "Levants",
    },
    tags: [
      { name: "type", value: "dispatch-load-test" },
      { name: "batch", value: batchLabel },
      { name: "recipientSlot", value: String((index % 6) + 1) },
    ],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const count = toInt(args.count, 50);
  const dryRun = toBool(args["dry-run"], false);
  const pauseMs = toInt(args.pauseMs, 350);
  const chunkSize = Math.min(100, Math.max(1, toInt(args.chunkSize, 100)));
  const recipients = getRecipientList(args);

  if (!process.env.RESEND_URI) {
    throw new Error("Missing RESEND_URI in environment");
  }

  if (!recipients.length) {
    throw new Error("No recipient emails provided");
  }

  const batchLabel = `bulk-${Date.now()}`;

  const jobs = Array.from({ length: count }, (_, i) => {
    const to = recipients[i % recipients.length];
    return buildJob(i, to, batchLabel);
  });

  console.log("========== BULK DISPATCH TEST ==========");
  console.log(`Total emails: ${count}`);
  console.log(`Unique recipient addresses: ${recipients.length}`);
  console.log(`Chunk size: ${chunkSize}`);
  console.log(`Pause between chunk calls: ${pauseMs}ms`);
  console.log(`Dry run: ${dryRun ? "YES" : "NO"}`);
  console.log("Recipients:");
  recipients.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
  console.log("========================================\n");

  if (dryRun) {
    console.log("Sample payload preview:");
    console.dir(jobs.slice(0, 3), { depth: null });
    return;
  }

  const chunks = chunkArray(jobs, chunkSize);

  let totalSent = 0;
  let totalFailed = 0;
  const failures = [];

  const startedAt = Date.now();

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    console.log(
      `Sending chunk ${i + 1}/${chunks.length} (${chunk.length} emails)...`,
    );

    const result = await sendBatchEmails(chunk, {
      chunkSize: 100, // resend batch max
      maxAttempts: 3,
      baseDelayMs: 750,
    });

    const results = Array.isArray(result?.results) ? result.results : [];

    const sent = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    totalSent += sent;
    totalFailed += failed;

    for (const r of results) {
      if (!r.success) {
        failures.push({
          orderId: r.orderId,
          to: r.to,
          status: r?.error?.status ?? null,
          message: r?.error?.message || "Email send failed",
        });
      }
    }

    console.log(
      `Chunk ${i + 1} complete -> sent: ${sent}, failed: ${failed}, cumulative sent: ${totalSent}, cumulative failed: ${totalFailed}`,
    );

    if (i < chunks.length - 1 && pauseMs > 0) {
      await sleep(pauseMs);
    }
  }

  const elapsedMs = Date.now() - startedAt;

  console.log("\n============= SUMMARY =============");
  console.log(`Requested: ${count}`);
  console.log(`Sent:      ${totalSent}`);
  console.log(`Failed:    ${totalFailed}`);
  console.log(`Elapsed:   ${(elapsedMs / 1000).toFixed(2)}s`);
  console.log("===================================");

  if (failures.length > 0) {
    console.log("\nFirst 20 failures:");
    failures.slice(0, 20).forEach((f, idx) => {
      console.log(
        `${idx + 1}. ${f.orderId} -> ${f.to} | status=${f.status} | ${f.message}`,
      );
    });
  }
}

main().catch((err) => {
  console.error("Bulk dispatch test failed:");
  console.error(err);
  process.exit(1);
});
