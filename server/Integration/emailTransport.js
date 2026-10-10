"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function prepareUatEmail(payload) {
  return {
    ...payload,
    from: "Levants UAT <no-reply@levantsdairy.co.uk>",
    subject: `[UAT] ${String(payload.subject || "").replace(/^(?:\[UAT\]\s*)+/i, "")}`,
  };
}

function createEmailTransport() {
  if (process.env.APP_ENV !== "uat") {
    const { Resend } = require("resend");
    const { RESEND_EMAIL_KEY } = require("../config/env");
    return new Resend(RESEND_EMAIL_KEY);
  }
  if (process.env.EMAIL_TRANSPORT === "resend") {
    if (!/^re_[A-Za-z0-9_\-]+$/.test(process.env.RESEND_EMAIL_KEY || "")) {
      throw new Error("UAT email requires its separate Resend key");
    }
    const { Resend } = require("resend");
    const provider = new Resend(process.env.RESEND_EMAIL_KEY);
    return {
      emails: { send: (payload) => provider.emails.send(prepareUatEmail(payload)) },
      batch: { send: (payloads) => provider.batch.send(payloads.map(prepareUatEmail)) },
    };
  }
  if (process.env.EMAIL_TRANSPORT !== "capture") throw new Error("Unknown UAT email transport");
  const capture = async (payload) => {
    const directory = process.env.UAT_EMAIL_OUTBOX;
    if (directory !== "/srv/levants-uat/shared/email-outbox") throw new Error("Invalid UAT outbox");
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (fs.readdirSync(directory).length >= 1000) throw new Error("UAT outbox is full");
    const id = `uat-${randomUUID()}`;
    const content = JSON.stringify({ capturedAt: new Date().toISOString(), ...payload });
    if (Buffer.byteLength(content) > 1024 * 1024) throw new Error("UAT captured message is too large");
    fs.writeFileSync(path.join(directory, `${id}.json`), content, { mode: 0o600, flag: "wx" });
    return { id };
  };
  return {
    emails: { send: capture },
    batch: { send: async (payloads) => ({ data: await Promise.all(payloads.map(capture)) }) },
  };
}

module.exports = { createEmailTransport, prepareUatEmail };
