"use strict";
// Real provider smoke checks. Never load dotenv, fixtures or production data.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const report = { release: process.env.RELEASE_SHA, checks: [], success: false };
const originalWrite = process.stdout.write.bind(process.stdout);
// Application dependencies may log. Only this script's allowlisted report leaves
// the process; provider errors can include request headers and secret URLs.
process.stdout.write = () => true;
process.stderr.write = () => true;
console.log = console.error = console.warn = console.info = () => {};
async function check(name, operation) {
  const started = Date.now();
  try {
    await operation();
    report.checks.push({ name, passed: true, durationMs: Date.now() - started });
  } catch {
    report.checks.push({ name, passed: false, durationMs: Date.now() - started });
  }
}
async function main() {
  assert.equal(process.env.APP_ENV, 'uat');
  require('../config/uatSafety').validateUatEnvironment();
  assert.equal(process.env.UAT_STRIPE_MODE, 'test');
  assert.equal(process.env.EMAIL_TRANSPORT, 'resend');
  assert.equal(process.env.UAT_STORAGE_MODE, 'cloudinary');
  assert.equal(process.env.UAT_GOOGLE_MODE, 'enabled');
  assert.equal(process.env.BACKGROUND_JOBS_ENABLED, 'true');
  const stripe = new (require('stripe'))(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20', timeout: 20000, maxNetworkRetries: 1 });
  await check('Stripe sandbox API and actual signed webhook delivery', async () => {
    assert.equal((await stripe.balance.retrieve()).livemode, false);
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    assert.ok(endpoints.data.some(endpoint => endpoint.url === 'https://uat-api.levantsdairy.co.uk/api/webhooks/stripe' && endpoint.status === 'enabled' && (endpoint.enabled_events.includes('*') || endpoint.enabled_events.includes('checkout.session.expired'))));
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', success_url: 'https://uat-api.levantsdairy.co.uk', cancel_url: 'https://uat-api.levantsdairy.co.uk',
      line_items: [{ quantity: 1, price_data: { currency: 'gbp', unit_amount: 100,
        product_data: { name: 'UAT automated integration probe' } } }],
      metadata: { uatIntegrationProbe: randomUUID() },
    });
    assert.equal(session.livemode, false);
    // No customer or payment method, no charge; expire immediately.
    await stripe.checkout.sessions.expire(session.id);
    let delivered = false;
    for (let attempt = 0; attempt < 24; attempt++) {
      const events = await stripe.events.list({ type: 'checkout.session.expired', created: { gte: session.created - 5 }, limit: 100 });
      const event = events.data.find(e => e.data.object.id === session.id);
      if (event && event.pending_webhooks === 0) { delivered = true; break; }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    assert.equal(delivered, true);
  });
  await check('Webhook rejects missing and invalid signatures', async () => {
    for (const headers of [{}, { 'stripe-signature': 't=1,v1=invalid' }]) {
      const response = await fetch('http://127.0.0.1:5002/api/webhooks/stripe', {
        method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}', signal: AbortSignal.timeout(10000),
      });
      assert.equal(response.status, 400);
    }
  });
  await check('Resend single and batch API acceptance with UAT labels', async () => {
    const { createEmailTransport, prepareUatEmail } = require('../Integration/emailTransport');
    const payload = { to: 'delivered@resend.dev', subject: 'Automated provider integration check', html: '<p>Synthetic UAT integration check.</p>' };
    assert.match(prepareUatEmail(payload).subject, /^\[UAT\] /);
    const mail = createEmailTransport();
    const single = await mail.emails.send(payload);
    assert.equal(single.error, null);
    assert.ok(single.data.id);
    const batch = await mail.batch.send([payload]);
    assert.equal(batch.error, null);
    assert.equal(batch.data.data.length, 1);
  });
  await check('Cloudinary isolated upload and deletion', async () => {
    const storage = require('../config/cloudinary');
    let uploaded;
    try {
      uploaded = await storage.uploader.upload('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1sAAAAASUVORK5CYII=', { folder: 'integration-checks' });
      assert.match(uploaded.public_id, /^levants-uat\/integration-checks\//);
    } finally {
      if (uploaded) assert.equal((await storage.uploader.destroy(uploaded.public_id)).result, 'ok');
    }
  });
  await check('Cloudinary refuses deletion outside UAT before provider call', async () => {
    let calls = 0;
    const storage = require('../utils/uatCloudinary').createUatCloudinary({
      uploader: { destroy: async () => { calls++; } }, api: { delete_resources: async () => { calls++; } },
    });
    await assert.rejects(storage.uploader.destroy('production/protected'));
    await assert.rejects(storage.api.delete_resources(['levants-uat/example', 'production/protected']));
    assert.equal(calls, 0);
  });
  await check('Google geocoding public landmark', async () => {
    const location = await require('../Integration/google.geocode').geocodeAddress({ line1: 'Trafalgar Square', city: 'London', country: 'UK' });
    assert.ok(location.lat > 51 && location.lat < 52 && location.lng > -1 && location.lng < 1);
  });
  await check('Google route optimization public locations', async () => {
    const start = new Date(Date.now() + 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const end = new Date(Date.now() + 172800000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const result = await require('../services/googleRoute.service').optimizeRoutes({ model: {
      globalStartTime: start, globalEndTime: end,
      vehicles: [{ startLocation: { latitude: 51.5007, longitude: -0.1246 }, endLocation: { latitude: 51.5007, longitude: -0.1246 } }],
      shipments: [{ deliveries: [{ arrivalLocation: { latitude: 51.5055, longitude: -0.0754 }, duration: '60s' }] }],
    } });
    assert.equal(result.routes.length, 1);
    assert.equal(result.routes[0].visits.length, 1);
  });
  await check('Dedicated UAT database and scheduler lease exclusion', async () => {
    const mongoose = require('mongoose');
    const name = 'integration-check-' + randomUUID();
    try {
      await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
      assert.equal(mongoose.connection.name, 'levants_uat');
      const { withSchedulerLease } = require('../services/schedulerLease.service');
      let nested;
      const first = await withSchedulerLease(name, async () => {
        nested = await withSchedulerLease(name, async () => { throw new Error('Lease exclusion failed'); }, { leaseMs: 60000 });
      }, { leaseMs: 60000 });
      assert.equal(first.acquired, true);
      assert.equal(nested.acquired, false);
    } finally {
      // Only the probe's lease; never inspect application/customer collections.
      if (mongoose.connection.readyState === 1) await mongoose.connection.collection('schedulerleases').deleteMany({ _id: name });
      await mongoose.disconnect();
    }
  });
  report.success = report.checks.every(check => check.passed);
}
main().catch(() => { report.checks.push({ name: 'UAT configuration preflight', passed: false }); }).finally(() => {
  originalWrite(JSON.stringify(report) + '\n');
  process.exit(report.success ? 0 : 1);
});
