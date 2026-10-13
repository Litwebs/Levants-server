const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function fixture({ failEmail = false } = {}) {
  const order = {
    _id: "order-test", customer: "customer-test", deliveryStatus: "ordered",
    metadata: {}, statusAudit: [],
    save: async () => {},
    toObject() { return { ...this }; },
  };
  let sends = 0;
  const templates = [];
  const applyUpdate = (update) => {
    for (const [key, value] of Object.entries(update.$set || {})) order.metadata[key.replace("metadata.", "")] = value;
    for (const key of Object.keys(update.$unset || {})) delete order.metadata[key.replace("metadata.", "")];
  };
  const Order = {
    findOne: async () => order,
    findById: async () => order,
    findOneAndUpdate: async (query, update) => {
      if (order.metadata.inTransitEmailSentAt || order.metadata.inTransitEmailClaimedAt) return null;
      applyUpdate(update);
      return order;
    },
    updateOne: async (query, update) => {
      if (query["metadata.inTransitEmailClaim"] !== order.metadata.inTransitEmailClaim) return;
      applyUpdate(update);
    },
  };
  const Customer = { findById: () => ({ select: () => ({ lean: async () => ({ firstName: "Test", email: "test@example.com" }) }) }) };
  const modules = {
    "../../models/order.model": Order,
    "../../models/customer.model": Customer,
    "../../Integration/Email.service": async () => {},
    "../files.service": {},
    "../../utils/ordersAdmin.util": { buildActiveOrderIdQuery: (id) => ({ _id: id }) },
    "../../utils/deliveryEmail.util": {
      claimOrdersForDispatchEmail: async () => new Set(order.metadata.dispatchedEmailSentAt ? [] : [order._id]),
      buildDispatchEmailJob: () => ({ ok: true, job: { to: "test@example.com", subject: "Dispatched", template: "orderDispatched", templateParams: {}, options: {} } }),
      sendEmailWithRetry: async ({ template }) => { sends++; templates.push(template); return failEmail ? { success: false, error: { message: "Provider unavailable" } } : { success: true, response: { data: { id: "resend-test" } } }; },
      persistDispatchEmailResults: async ([result]) => {
        if (result.success) {
          order.metadata.dispatchedEmailSentAt = new Date();
          order.metadata.dispatchedEmailProviderId = result.providerId;
        } else order.metadata.dispatchedEmailLastError = result.error;
      },
    },
  };
  const context = { module: { exports: {} }, require: (name) => Object.hasOwn(modules, name) ? modules[name] : require(name), console, Date };
  vm.runInNewContext(fs.readFileSync(require.resolve("../services/orders/orders.status.service"), "utf8"), context);
  return { order, service: context.module.exports, sends: () => sends, templates };
}

test("dispatch records actor and transition, sends once, and returns the email marker", async () => {
  const f = fixture();
  const args = { orderId: f.order._id, deliveryStatus: "dispatched", actorName: "Test Admin", actorRoleName: "admin" };
  const result = await f.service.UpdateOrderStatus(args);
  assert.equal(result.data.statusAudit[0].from, "ordered");
  assert.equal(result.data.statusAudit[0].to, "dispatched");
  assert.equal(result.data.statusAudit[0].actorName, "Test Admin");
  assert.equal(result.data.metadata.dispatchedEmailProviderId, "resend-test");
  await f.service.UpdateOrderStatus(args);
  assert.equal(f.order.statusAudit.length, 1);
  assert.equal(f.sends(), 1);
});

test("failed dispatch email retains the status audit and can be retried", async () => {
  const f = fixture({ failEmail: true });
  const args = { orderId: f.order._id, deliveryStatus: "dispatched" };
  await f.service.UpdateOrderStatus(args);
  assert.equal(f.order.statusAudit.length, 1);
  assert.equal(f.order.metadata.dispatchedEmailSentAt, undefined);
  assert.equal(f.order.metadata.dispatchedEmailLastError.message, "Provider unavailable");
  await f.service.UpdateOrderStatus(args);
  assert.equal(f.sends(), 2);
  assert.equal(f.order.statusAudit.length, 1);
});

test("in-transit sends the correct template once and records its Resend ID", async () => {
  const f = fixture();
  const args = { orderId: f.order._id, deliveryStatus: "in_transit" };
  await f.service.UpdateOrderStatus(args);
  assert.equal(f.templates[0], "orderInTransit");
  assert.equal(f.order.metadata.inTransitEmailProviderId, "resend-test");
  assert.ok(f.order.metadata.inTransitEmailSentAt);
  assert.equal(f.order.metadata.inTransitEmailClaim, undefined);
  await f.service.UpdateOrderStatus(args);
  assert.equal(f.sends(), 1);
  assert.equal(f.order.statusAudit.length, 1);
});

test("failed in-transit send clears its claim and remains retryable", async () => {
  const f = fixture({ failEmail: true });
  const args = { orderId: f.order._id, deliveryStatus: "in_transit" };
  await f.service.UpdateOrderStatus(args);
  assert.equal(f.order.metadata.inTransitEmailSentAt, undefined);
  assert.equal(f.order.metadata.inTransitEmailClaimedAt, undefined);
  assert.equal(f.order.metadata.inTransitEmailLastError.message, "Provider unavailable");
  await f.service.UpdateOrderStatus(args);
  assert.equal(f.sends(), 2);
  assert.equal(f.order.statusAudit.length, 1);
});

test("in-transit template describes the correct status and escapes order data", () => {
  const template = require("../Templates/orderInTransit");
  const html = template({ name: "<name>", orderId: "<order>" });
  assert.match(html, /Order In Transit/);
  assert.match(html, /is in transit and on its way to you/);
  assert.match(html, /&lt;order&gt;/);
  assert.doesNotMatch(html, /has been dispatched/);
});
