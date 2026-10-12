"use strict";
const { createHash, randomUUID } = require("node:crypto");
const Alert = require("../../models/subscriptionRecoveryAlert.model");
const { withSchedulerLease } = require("../schedulerLease.service");
const logger = require("../../utils/logger.util");
const MAX_SENDS = 5;
const CLAIM_MS = 5 * 60 * 1000;
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const text = value => String(value ?? "").slice(0, 160);
const escape = value => text(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function incidents(report) {
  const definitions = [
    ["mutations", "Subscription change", row => row._id, ["operationId", "mutationType"]],
    ["invoices", "Invoice fulfillment", row => row._id || row.invoiceId, ["invoiceId", "subscription", "legacyReviewRequired", "inventoryBlocked"]],
    ["customersWithCardRecovery", "Customer payment setup", row => row._id, []],
    ["resumes", "Subscription resume", row => row._id, ["subscriptionNumber"]],
    ["agedInventoryHolds", "Aged stock reservation", row => row.key, ["subscription"]],
  ];
  const result = new Map();
  for (const [category, label, identify, fields] of definitions) {
    for (const row of report[category] || []) {
      const id = String(identify(row) ?? "");
      if (!id) continue;
      const key = hash([category, id]);
      result.set(key, { key, label, details: { record: text(id), ...Object.fromEntries(fields.filter(field => row[field] != null).map(field => [field, text(row[field])])) } });
    }
  }
  return [...result.values()].sort((a, b) => a.key.localeCompare(b.key));
}
function payloadFor(incident, recipient, environment, now) {
  const lines = Object.entries(incident.details).map(([key, value]) => `${key}: ${value}`);
  const note = "A subscription operation needs investigation. This alert does not perform a repair or retry a payment.";
  return {
    from: "Levants Dairy <no-reply@levantsdairy.co.uk>", to: recipient,
    subject: `Subscription recovery: ${incident.label}`,
    text: `${note}\nEnvironment: ${environment}\nDetected: ${new Date(now).toISOString()}\n${lines.join("\n")}`,
    html: `<h2>Subscription recovery requires review</h2><p>${note}</p><p>Environment: ${escape(environment)}<br>Detected: ${escape(new Date(now).toISOString())}</p><ul>${lines.map(line => `<li>${escape(line)}</li>`).join("")}</ul>`,
  };
}
async function notifySubscriptionRecovery(report, { now = Date.now(), send, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (process.env.SUBSCRIPTION_RECOVERY_ALERTS_ENABLED !== "true") return { enabled: false, sent: 0 };
  const recipient = String(process.env.SUBSCRIPTION_RECOVERY_ALERT_EMAIL || "").trim().toLowerCase();
  if (recipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    logger.error("[SubscriptionRecoveryAlerts] Configure one valid recovery-alert recipient");
    return { enabled: true, sent: 0, configurationError: true };
  }
  const environment = process.env.APP_ENV === "uat" ? "uat" : "production";
  const namespace = hash([environment, recipient]);
  const found = incidents(report);
  const keys = found.map(incident => `recovery:${namespace}:${incident.key}`);
  const summary = { enabled: true, sent: 0, failed: 0, needsReview: 0, observed: found.length };
  const run = await withSchedulerLease(`subscription-recovery-alerts:${namespace}`, async ({ renew }) => {
    await Alert.updateMany({ namespace, active: true, _id: { $nin: keys } }, { $set: { active: false } });
    let attempted = 0;
    for (const [index, incident] of found.entries()) {
      const id = keys[index];
      await Alert.updateOne({ _id: id }, { $set: { lastSeenAt: new Date(now) }, $setOnInsert: { namespace, active: true, notified: false, generation: 0 } }, { upsert: true });
      await Alert.updateOne({ _id: id, active: false }, { $set: { active: true, notified: false }, $inc: { generation: 1 },
        $unset: { requestKey: "", payload: "", firstAttemptAt: "", lastAttemptAt: "", claimOwner: "", claimUntil: "", providerId: "", notifiedAt: "", lastResult: "" } });
      if (attempted >= MAX_SENDS) continue;
      const owner = randomUUID();
      const claimed = await Alert.findOneAndUpdate({ _id: id, active: true, notified: false,
        $or: [{ claimUntil: null }, { claimUntil: { $lte: new Date(now) } }] },
      { $set: { claimOwner: owner, claimUntil: new Date(now + CLAIM_MS) } }, { new: true }).lean();
      if (!claimed) continue;
      const fence = { _id: id, claimOwner: owner, generation: claimed.generation, active: true };
      if (claimed.firstAttemptAt && now - claimed.firstAttemptAt.getTime() >= RETRY_WINDOW_MS) {
        await Alert.updateOne(fence, { $set: { lastResult: "delivery_requires_review" }, $unset: { claimOwner: "", claimUntil: "" } });
        logger.error(`[SubscriptionRecoveryAlerts] Delivery requires review for alert ${id}; provider retry window elapsed`);
        summary.needsReview++;
        continue;
      }
      if (!claimed.requestKey) {
        claimed.requestKey = `subscription-recovery/${randomUUID()}`;
        claimed.payload = payloadFor(incident, recipient, environment, now);
        await Alert.updateOne(fence, { $set: { requestKey: claimed.requestKey, payload: claimed.payload, firstAttemptAt: new Date(now) } });
      }
      try {
        if (attempted) await pause(600);
        await renew();
        attempted++;
        await Alert.updateOne(fence, { $set: { lastAttemptAt: new Date(now) } });
        const deliver = send || ((payload, options) => require("../../Integration/emailTransport").createEmailTransport().emails.send(payload, options));
        const response = await deliver(claimed.payload, { idempotencyKey: claimed.requestKey });
        const providerId = response?.data?.id || response?.id;
        if (response?.error || !providerId) throw Error("provider_not_accepted");
        await renew();
        const saved = await Alert.updateOne(fence, { $set: { notified: true, notifiedAt: new Date(now), providerId, lastResult: "accepted" }, $unset: { claimOwner: "", claimUntil: "" } });
        if (saved.modifiedCount !== 1) throw Error("claim_lost");
        summary.sent++;
      } catch {
        // Keep the original payload/key for provider-safe retries after ambiguous outcomes.
        await Alert.updateOne(fence, { $set: { lastResult: "retry_pending" }, $unset: { claimOwner: "", claimUntil: "" } });
        logger.error(`[SubscriptionRecoveryAlerts] Email delivery pending retry for alert ${id}`);
        summary.failed++;
      }
    }
    return summary;
  }, { leaseMs: CLAIM_MS });
  return run.acquired ? summary : { ...summary, skipped: "another_worker" };
}
module.exports = { notifySubscriptionRecovery, incidents, payloadFor };
