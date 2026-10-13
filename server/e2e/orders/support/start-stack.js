"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const { configureSafeEnvironment, SERVER_ROOT } = require("../../support/safe-environment");
const { startStripeListener, stopStripeListener } = require("../../support/stripe-listener");

const TOKEN = "isolated-orders-test-control";
let db, api, control, listener, fixtures, directory, stopping = false;
async function stop(code) {
  if (stopping) return; stopping = true;
  stopStripeListener(listener);
  for (const server of [control, api]) if (server?.listening) await new Promise(r => server.close(r));
  await fixtures?.cleanup().catch(e => process.stderr.write(`Order fixture cleanup failed: ${e.message}\n`));
  await mongoose.disconnect(); await db?.stop();
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
  process.exit(code);
}
async function start() {
  const { secretKey } = configureSafeEnvironment();
  // All database state is ephemeral. No caller-supplied database URI is used.
  db = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = process.env.MONGO_URI_TEST = db.getUri("isolated-orders-e2e");
  Object.assign(process.env, { PORT: "5001", FRONTEND_URL_DEV: "http://localhost:4176", CLIENT_FRONT_URL_DEV: "http://localhost:4177", BACKGROUND_JOBS_ENABLED: "false", JWT_ACCESS_EXPIRES_IN: "1h", JWT_REFRESH_EXPIRES_IN: "1d" });
  await mongoose.connect(process.env.MONGO_URI);
  listener = await startStripeListener({ secretKey, forwardTo: "http://127.0.0.1:5001/api/webhooks/stripe" });
  if (listener.signingSecret) process.env.STRIPE_WEBHOOK_SECRET = listener.signingSecret;
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "isolated-orders-e2e-")); process.chdir(directory);
  // Stub only the external storage transport. Compression, file records,
  // upload validation and all order services/controllers remain real.
  const cloudinary = require(path.join(SERVER_ROOT, "config/cloudinary"));
  cloudinary.uploader.upload = async (file, options) => {
    if (global.__ORDER_E2E_FAIL_UPLOAD__) { global.__ORDER_E2E_FAIL_UPLOAD__ = false; throw new Error("Injected storage outage"); }
    const bytes = fs.readFileSync(file);
    const id = `orders-proof-${crypto.randomUUID()}`;
    (global.__ORDER_E2E_UPLOADS__ ||= []).push({ size: bytes.length, hash: crypto.createHash("sha256").update(bytes).digest("hex"), folder: options.folder });
    return { public_id: id, secure_url: `https://orders-storage.example.invalid/${id}.jpg`, bytes: bytes.length, width: 1, height: 1 };
  };
  const app = require(path.join(SERVER_ROOT, "app"));
  const BusinessInfo = require(path.join(SERVER_ROOT, "models/businessInfo.model"));
  const timeout = Date.now() + 30_000;
  while (!(await BusinessInfo.exists({ singletonKey: "business-info" }))) {
    if (Date.now() > timeout) throw new Error("App startup seeding did not complete");
    await new Promise(r => setTimeout(r, 50));
  }
  fixtures = require("./fixtures");
  const testControl = express(); testControl.use(express.json());
  testControl.get("/health", (_, res) => res.json({ mode: "isolated-orders-e2e" }));
  testControl.use((req, res, next) => req.get("x-orders-test-token") === TOKEN ? next() : res.sendStatus(403));
  const route = fn => async (req, res) => { try { res.json({ data: await fn(req) }); } catch (e) { res.status(500).json({ message: e.message }); } };
  testControl.post("/fixtures", route(async req => { await fixtures.reset(); return fixtures.create(req.body); }));
  testControl.get("/state/:id", route(req => fixtures.state(req.params.id)));
  testControl.post("/storage-failure", route(async () => { global.__ORDER_E2E_FAIL_UPLOAD__ = true; return { injected: true }; }));
  testControl.post("/refund-replay/:id", route(async req => {
    const Order = require(path.join(SERVER_ROOT, "models/order.model"));
    const stripe = require(path.join(SERVER_ROOT, "utils/stripe.util"));
    const order = await Order.findById(req.params.id).lean();
    const record = order.refunds?.find(r => r.status === "succeeded");
    if (!record) throw new Error("No succeeded refund to replay");
    const object = await stripe.refunds.retrieve(record.stripeRefundId);
    const event = { id: `evt_orders_replay_${crypto.randomUUID()}`, type: "refund.updated", data: { object } };
    const body = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret: process.env.STRIPE_WEBHOOK_SECRET });
    const response = await fetch("http://127.0.0.1:5001/api/webhooks/stripe", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature }, body });
    return { status: response.status, body: await response.text() };
  }));
  api = http.createServer(app); control = http.createServer(testControl);
  for (const [server, port] of [[api, 5001], [control, 5013]]) await new Promise(r => server.listen(port, "127.0.0.1", r));
  process.stdout.write("Isolated orders API and fixture control ready\n");
}
process.on("SIGINT", () => void stop(0)); process.on("SIGTERM", () => void stop(0));
for (const name of ["uncaughtException", "unhandledRejection"]) process.on(name, e => { process.stderr.write(`${name}: ${e?.message || e}\n`); void stop(1); });
start().catch(e => { process.stderr.write(`Orders stack failed: ${e.message}\n`); void stop(1); });
