"use strict";
const mongoose = require("mongoose");
const Mutation = require("../../models/subscriptionMutation.model");
const Plan = require("../../models/subscriptionInvoiceFulfillment.model");
const Customer = require("../../models/customer.model");
const logger = require("../../utils/logger.util");
const { auditUnresolvedSubscriptionOperations: audit } = require("../../services/subscriptions/subscriptionRecoveryAudit.service");
const id = () => new mongoose.Types.ObjectId();
test("alerts on stale financial recovery and held invoices, while allowing new drafts and confirmed unpaid declines", async () => {
  const now = Date.now();
  const customer = id();
  const sub = id();
  const create = async (operationId, snapshot) => {
    const mutation = await Mutation.create({ customer, operationId, mutationType: "create_subscription", requestHash: operationId,
      status: "failed", creationSnapshot: snapshot });
    await Mutation.collection.updateOne({ _id: mutation._id }, { $set: { updatedAt: new Date(now - 180000) } });
  };
  await create("unknown-outcome", { startedAt: new Date(now - 180000) });
  await create("unpaid-decline", { declined: true });
  const draft = { subscription: sub, billingWindowStart: new Date(), billingWindowEnd: new Date(), deliveries: [] };
  await Plan.create({ ...draft, invoiceId: "new-draft" });
  await Plan.create({ ...draft, invoiceId: "stock-held", inventoryBlocked: true });
  const output = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    const report = await audit({ now });
    expect(report.count).toBe(2);
    expect(report.mutations.map(item => item.operationId)).toEqual(["unknown-outcome"]);
    expect(report.invoices.map(item => item.invoiceId)).toEqual(["stock-held"]);
    expect(output).toHaveBeenCalledTimes(1);
    const message = output.mock.calls[0][0];
    expect(message).toContain("unknown-outcome");
    expect(message).toContain("stock-held");
    expect(message).not.toContain("unpaid-decline");
    expect(message).not.toContain("new-draft");
    expect(JSON.stringify(report)).not.toContain("email");
  } finally { output.mockRestore(); }
});
test("flags an interrupted customer identity without leaking its request details", async () => {
  const now = Date.now();
  const customer = await Customer.create({ firstName: "Profile", lastName: "Recovery", email: "profile-recovery@example.com", stripeCustomerCreation: { id: "profile-op", params: { email: "private@example.com" } } });
  await Customer.collection.updateOne({ _id: customer._id }, { $set: { updatedAt: new Date(now - 180000) } });
  const error = jest.spyOn(logger, "error").mockImplementation(() => {});
  try {
    const report = await audit({ now });
    expect(report.customersWithCardRecovery.map(entry => String(entry._id))).toContain(String(customer._id));
    expect(JSON.stringify(report)).not.toContain("private@example.com");
  } finally { error.mockRestore(); }
});

test("email notification failure does not prevent returning the financial recovery audit", async () => {
  const alerts = require("../../services/subscriptions/subscriptionRecoveryAlerts.service");
  jest.spyOn(alerts, "notifySubscriptionRecovery").mockRejectedValueOnce(new Error("notification unavailable"));
  const result = await audit();
  expect(result.count).toBe(0);
});
