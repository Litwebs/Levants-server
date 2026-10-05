"use strict";
jest.mock("../../utils/stripe.util", () => ({
  subscriptions: { list: jest.fn(), update: jest.fn() },
  customers: { retrieve: jest.fn(), update: jest.fn() },
  paymentMethods: { retrieve: jest.fn() },
}));
const mongoose = require("mongoose");
const Customer = require("../../models/customer.model");
const PaymentMethod = require("../../models/paymentMethod.model");
const Subscription = require("../../models/subscription.model");
const stripe = require("../../utils/stripe.util");
const { setCustomerDefaultCard: setDefault, cardIsUsedBySubscription: used } = require("../../services/customerPortal/subscriptionPaymentMethod.service");
let customer, method, session, pending;
beforeEach(() => {
  jest.clearAllMocks();
  pending = null;
  customer = { _id: "customer", stripeCustomerId: "cus" };
  method = { _id: "new", provider: "stripe", providerReference: "pm_new", isDefault: false };
  session = { withTransaction: async fn => {
    const before = pending;
    try { await fn(); } catch (error) { pending = before; throw error; }
  }, endSession: jest.fn() };
  jest.spyOn(Customer, 'findOneAndUpdate').mockImplementation(() => ({ select: async () => ({ paymentMethodOperation: pending }) }));
  jest.spyOn(Customer, 'updateOne').mockImplementation(async (filter, update) => {
    if (Object.hasOwn(update.$set, 'paymentMethodOperation')) pending = update.$set.paymentMethodOperation;
    return { matchedCount: 1 };
  });
  jest.spyOn(PaymentMethod, 'findOne').mockImplementation(() => ({ select: async () => method }));
  jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
  jest.spyOn(PaymentMethod, "updateMany").mockResolvedValue({});
  jest.spyOn(PaymentMethod, "updateOne").mockResolvedValue({ matchedCount: 1 });
  jest.spyOn(Subscription, "updateMany").mockResolvedValue({});
  stripe.paymentMethods.retrieve.mockResolvedValue({ id: "pm_new", type: "card", customer: "cus" });
  stripe.subscriptions.list.mockResolvedValue({ data: [], has_more: false });
  stripe.subscriptions.update.mockResolvedValue({});
  stripe.customers.update.mockResolvedValue({});
  stripe.customers.retrieve.mockResolvedValue({ invoice_settings: { default_payment_method: "pm_new" } });
});
afterEach(() => jest.restoreAllMocks());
it("migrates active and paused subscription pins before switching the customer default", async () => {
  stripe.subscriptions.list.mockResolvedValueOnce({ data: [
    { id: "sub_active", status: "active", default_payment_method: "pm_old" },
    { id: "sub_paused", status: "paused", default_source: "card_old" },
    { id: "sub_cancelled", status: "canceled", default_payment_method: "pm_old" },
  ] });
  await setDefault(customer, method);
  expect(stripe.subscriptions.update.mock.calls.map(c => c[0])).toEqual(["sub_active", "sub_paused"]);
  expect(stripe.subscriptions.update.mock.calls[0][1]).toEqual({ default_payment_method: "", default_source: "" });
  expect(stripe.customers.update.mock.invocationCallOrder[0]).toBeGreaterThan(stripe.subscriptions.update.mock.invocationCallOrder[1]);
  expect(Subscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({ status: { $in: ["active", "paused"] } }),
    { $set: { paymentMethod: "new" } }, { session });
  expect(method.isDefault).toBe(true);
});
it("does not switch customer or local defaults if subscription migration fails, and can retry", async () => {
  stripe.subscriptions.list.mockResolvedValue({ data: [{ id: "sub", status: "active", default_payment_method: "old" }] });
  stripe.subscriptions.update.mockRejectedValueOnce(new Error("Stripe unavailable"));
  await expect(setDefault(customer, method)).rejects.toThrow("Stripe unavailable");
  expect(stripe.customers.update).not.toHaveBeenCalled();
  expect(PaymentMethod.updateMany).not.toHaveBeenCalled();
  await setDefault(customer, method);
  expect(method.isDefault).toBe(true);
});
it("keeps local defaults untouched when the customer update fails", async () => {
  stripe.customers.update.mockRejectedValueOnce(new Error("Stripe unavailable"));
  await expect(setDefault(customer, method)).rejects.toThrow("Stripe unavailable");
  expect(PaymentMethod.updateMany).not.toHaveBeenCalled();
});
it("checks ownership before any billing changes", async () => {
  stripe.paymentMethods.retrieve.mockResolvedValue({ type: "card", customer: "other" });
  await expect(setDefault(customer, method)).rejects.toThrow("not attached");
  expect(stripe.subscriptions.list).not.toHaveBeenCalled();
  expect(stripe.customers.update).not.toHaveBeenCalled();
});
it.each(["active", "paused", "past_due", "trialing", "incomplete"])("protects a card pinned to a %s subscription", async status => {
  stripe.subscriptions.list.mockResolvedValue({ data: [{ id: "sub", status, default_payment_method: { id: "pm_new" } }] });
  expect(await used(customer, method)).toBe(true);
});
it("protects an inherited default card even without a local subscription link", async () => {
  stripe.subscriptions.list.mockResolvedValue({ data: [{ id: "sub", status: "active", default_payment_method: null }] });
  expect(await used(customer, method)).toBe(true);
});
it("checks subscriptions beyond the first provider page", async () => {
  stripe.subscriptions.list.mockResolvedValueOnce({ data: [{ id: "first", status: "canceled" }], has_more: true })
    .mockResolvedValueOnce({ data: [{ id: "second", status: "paused", default_payment_method: "pm_new" }], has_more: false });
  expect(await used(customer, method)).toBe(true);
  expect(stripe.subscriptions.list.mock.calls[1][0].starting_after).toBe("first");
});
it("allows removal when only cancelled subscriptions reference a card", async () => {
  stripe.subscriptions.list.mockResolvedValue({ data: [{ id: "sub", status: "canceled", default_payment_method: "pm_new" }] });
  expect(await used(customer, method)).toBe(false);
});
it("fails closed if live billing references cannot be checked", async () => {
  stripe.subscriptions.list.mockRejectedValueOnce(new Error("Stripe unavailable"));
  await expect(used(customer, method)).rejects.toThrow("Stripe unavailable");
});
it('retains a durable intent after a local transaction failure and retries identical Stripe commands', async () => {
  PaymentMethod.updateMany.mockRejectedValueOnce(new Error('database unavailable'));
  await expect(setDefault(customer, method)).rejects.toThrow('database unavailable');
  expect(pending).toMatchObject({ kind: 'set_default', methodId: 'new', targetId: 'new' });
  const first = stripe.customers.update.mock.calls[0];
  await setDefault(customer, method);
  expect(stripe.customers.update.mock.calls[1]).toEqual(first);
  expect(pending).toBeNull();
  expect(method.isDefault).toBe(true);
});
it('blocks another target and deletion until the interrupted update finishes', async () => {
  stripe.customers.update.mockRejectedValueOnce(new Error('response lost'));
  await expect(setDefault(customer, method)).rejects.toThrow('response lost');
  await expect(setDefault(customer, { ...method, _id: 'other' })).rejects.toThrow('earlier card update');
  const { deleteCustomerCard } = require('../../services/customerPortal/subscriptionPaymentMethod.service');
  await expect(deleteCustomerCard(customer, method)).rejects.toThrow('earlier card update');
  expect(stripe.customers.update).toHaveBeenCalledTimes(1);
});
it('blocks concurrent workers before any Stripe writes', async () => {
  Customer.findOneAndUpdate.mockReturnValueOnce({ select: async () => null });
  await expect(setDefault(customer, method)).rejects.toThrow('in progress');
  expect(stripe.customers.update).not.toHaveBeenCalled();
});
it('fails closed outside the safe replay window', async () => {
  pending = { kind: 'set_default', methodId: 'new', startedAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    commands: [{ resource: 'customers', id: 'cus', params: {} }] };
  await expect(setDefault(customer, method)).rejects.toThrow('support reconciliation');
  expect(stripe.customers.update).not.toHaveBeenCalled();
});
it('fences a worker whose lease was taken over before its next remote command', async () => {
  Customer.updateOne.mockResolvedValueOnce({ matchedCount: 1 }).mockResolvedValueOnce({ matchedCount: 0 });
  await expect(setDefault(customer, method)).rejects.toThrow('lock expired');
  expect(stripe.customers.update).not.toHaveBeenCalled();
});
it('does not write to Stripe unless the operation is durable', async () => {
  Customer.updateOne.mockRejectedValueOnce(new Error('intent write failed'));
  await expect(setDefault(customer, method)).rejects.toThrow('intent write failed');
  expect(stripe.customers.update).not.toHaveBeenCalled();
});
it('does not commit local pointers after losing its lease during the Stripe request', async () => {
  Customer.updateOne.mockResolvedValueOnce({ matchedCount: 1 })
    .mockResolvedValueOnce({ matchedCount: 1 }).mockResolvedValueOnce({ matchedCount: 0 });
  await expect(setDefault(customer, method)).rejects.toThrow('lock expired');
  expect(stripe.customers.update).toHaveBeenCalledTimes(1);
  expect(PaymentMethod.updateMany).not.toHaveBeenCalled();
});
it('keeps the frozen remote command list after a partial migration', async () => {
  stripe.subscriptions.list.mockResolvedValueOnce({ data: [
    { id: 'sub_a', status: 'active', default_payment_method: 'old_a' },
    { id: 'sub_b', status: 'active', default_payment_method: 'old_b' },
  ] });
  stripe.subscriptions.update.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('response lost'));
  await expect(setDefault(customer, method)).rejects.toThrow('response lost');
  const commands = stripe.subscriptions.update.mock.calls.slice();
  await setDefault(customer, method);
  expect(stripe.subscriptions.update.mock.calls.slice(2)).toEqual(commands);
  expect(stripe.subscriptions.list).toHaveBeenCalledTimes(1);
});
