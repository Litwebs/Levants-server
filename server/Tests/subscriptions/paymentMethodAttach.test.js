const mongoose = require("mongoose");
const Customer = require("../../models/customer.model");
const PaymentMethod = require("../../models/paymentMethod.model");
const stripe = require("../../utils/stripe.util");
const paymentService = require("../../services/customerPortal/customerPayments.service");

describe("customer payment method attachment", () => {
  test("concurrent saves retain one local identity for a confirmed card", async () => {
    const customer = await createCustomer();
    await PaymentMethod.create({ customer: customer._id, type: "card", provider: "stripe", providerReference: "pm_default_existing", isDefault: true });
    stripe.paymentMethods.retrieve.mockResolvedValue({ id: "pm_same_concurrent", customer: "cus_existing", type: "card" });
    const results = await Promise.all([1, 2].map(() => paymentService.AttachPaymentMethod({
      customerId: customer._id, stripePaymentMethodId: "pm_same_concurrent", setDefault: false,
    })));
    expect(results.every(result => result.success)).toBe(true);
    expect(String(results[0].data.paymentMethod._id)).toBe(String(results[1].data.paymentMethod._id));
    expect(await PaymentMethod.countDocuments({ customer: customer._id, providerReference: "pm_same_concurrent" })).toBe(1);
  });
  async function createCustomer() {
    return Customer.create({
      email: `payment-${Date.now()}@example.com`,
      firstName: "Payment",
      lastName: "Customer",
      isGuest: false,
      stripeCustomerId: "cus_existing",
    });
  }

  test("does not attach a method twice after SetupIntent confirmation", async () => {
    const customer = await createCustomer();
    stripe.paymentMethods.retrieve.mockResolvedValueOnce({
      id: "pm_attached",
      customer: "cus_existing",
      type: "card",
      card: {
        brand: "visa",
        last4: "4242",
        exp_month: 12,
        exp_year: 2034,
      },
    });

    const result = await paymentService.AttachPaymentMethod({
      customerId: customer._id,
      stripePaymentMethodId: "pm_attached",
      setDefault: true,
    });

    expect(result.success).toBe(true);
    expect(stripe.paymentMethods.attach).not.toHaveBeenCalled();
    expect(stripe.customers.update).toHaveBeenCalledWith("cus_existing", {
      invoice_settings: { default_payment_method: "pm_attached" },
    }, expect.objectContaining({ idempotencyKey: expect.any(String) }));
    const saved = await PaymentMethod.findOne({ customer: customer._id })
      .select("+providerReference")
      .lean();
    expect(saved.providerReference).toBe("pm_attached");
    expect(saved.isDefault).toBe(true);
  });

  test("attaches a method when it has not already been attached", async () => {
    const customer = await createCustomer();
    stripe.paymentMethods.retrieve.mockResolvedValueOnce({
      id: "pm_new",
      customer: null,
      type: "card",
      card: {
        brand: "visa",
        last4: "4242",
        exp_month: 12,
        exp_year: 2034,
      },
    });

    const result = await paymentService.AttachPaymentMethod({
      customerId: customer._id,
      stripePaymentMethodId: "pm_new",
      setDefault: true,
    });

    expect(result.success).toBe(true);
    expect(stripe.paymentMethods.attach).toHaveBeenCalledWith("pm_new", {
      customer: "cus_existing",
    });
  });
  test("updates saved defaults and legacy active/paused subscription links together", async () => {
    const customer = await createCustomer();
    const old = await PaymentMethod.create({ customer: customer._id, provider: "stripe", providerReference: "pm_old", type: "card", isDefault: true });
    const next = await PaymentMethod.create({ customer: customer._id, provider: "stripe", providerReference: "pm_next", type: "card" });
    const Subscription = require("../../models/subscription.model");
    for (const status of ["active", "paused"]) await Subscription.create({
      customer: customer._id, frequency: "weekly", preferredDeliveryDay: 0,
      startDate: new Date(), nextDeliveryDate: new Date(), status,
      deliveryAddress: { line1: "1 Street", city: "London", postcode: "SW1A 1AA", country: "UK" },
      paymentMethod: null,
      items: [{ product: new mongoose.Types.ObjectId(), variant: new mongoose.Types.ObjectId(),
        name: "Test milk", sku: "TEST-MILK", quantity: 1, unitPrice: 2.5 }],
    });
    stripe.paymentMethods.retrieve.mockResolvedValueOnce({ id: "pm_next", type: "card", customer: "cus_existing" });
    expect((await paymentService.SetDefaultPaymentMethod({ customerId: customer._id, paymentMethodId: next._id })).success).toBe(true);
    expect((await PaymentMethod.findById(old._id)).isDefault).toBe(false);
    expect((await PaymentMethod.findById(next._id)).isDefault).toBe(true);
    const subscriptions = await Subscription.find({ customer: customer._id });
    expect(subscriptions.every(sub => String(sub.paymentMethod) === String(next._id))).toBe(true);
  });

  test("blocks deletion of a paused subscription's card even without a local card link", async () => {
    const customer = await createCustomer();
    const method = await PaymentMethod.create({ customer: customer._id, provider: "stripe", providerReference: "pm_needed", type: "card" });
    stripe.subscriptions.list.mockResolvedValueOnce({ data: [{ id: "sub_legacy", status: "paused", default_payment_method: "pm_needed" }] });
    const result = await paymentService.DeletePaymentMethod({ customerId: customer._id, paymentMethodId: method._id });
    expect(result.success).toBe(false);
    expect(stripe.paymentMethods.detach).not.toHaveBeenCalled();
    expect(await PaymentMethod.findById(method._id)).toBeTruthy();
  });

  test("keeps a saved card when Stripe detach fails", async () => {
    const customer = await createCustomer();
    const method = await PaymentMethod.create({ customer: customer._id, provider: "stripe", providerReference: "pm_old", type: "card" });
    stripe.paymentMethods.detach.mockRejectedValueOnce(new Error("Stripe unavailable"));
    const result = await paymentService.DeletePaymentMethod({ customerId: customer._id, paymentMethodId: method._id });
    expect(result.success).toBe(false);
    expect(result.message).toContain("Stripe unavailable");
    expect(await PaymentMethod.findById(method._id)).toBeTruthy();
  });

  test("refresh recovers a default-card change after the local transaction fails", async () => {
    const customer = await createCustomer();
    const old = await PaymentMethod.create({ customer: customer._id, provider: "stripe", providerReference: "pm_old", type: "card", isDefault: true });
    const next = await PaymentMethod.create({ customer: customer._id, provider: "stripe", providerReference: "pm_next", type: "card" });
    stripe.paymentMethods.retrieve.mockResolvedValue({ id: "pm_next", type: "card", customer: "cus_existing" });
    const write = jest.spyOn(PaymentMethod, "updateMany").mockRejectedValueOnce(new Error("database unavailable"));
    try {
      await expect(paymentService.SetDefaultPaymentMethod({ customerId: customer._id, paymentMethodId: next._id })).rejects.toThrow("database unavailable");
    } finally { write.mockRestore(); }
    const interrupted = await Customer.findById(customer._id).select("+paymentMethodOperation");
    expect(interrupted.paymentMethodOperation.targetId).toBe(String(next._id));
    expect((await PaymentMethod.findById(old._id)).isDefault).toBe(true);
    const originalCommand = stripe.customers.update.mock.calls.at(-1);
    const conflict = await paymentService.DeletePaymentMethod({ customerId: customer._id, paymentMethodId: old._id });
    expect(conflict.success).toBe(false);
    expect(conflict.message).toMatch(/unfinished/);
    expect((await paymentService.ListPaymentMethods({ customerId: customer._id })).success).toBe(true);
    expect(stripe.customers.update.mock.calls.at(-1)).toEqual(originalCommand);
    expect((await PaymentMethod.findById(next._id)).isDefault).toBe(true);
    expect((await PaymentMethod.findById(old._id)).isDefault).toBe(false);
    expect((await Customer.findById(customer._id).select("+paymentMethodOperation")).paymentMethodOperation).toBeNull();
  });

  test("delete retries a detached card after a database failure using the same Stripe command", async () => {
    const customer = await createCustomer();
    const method = await PaymentMethod.create({ customer: customer._id, provider: "stripe", providerReference: "pm_unused", type: "card" });
    const write = jest.spyOn(PaymentMethod, "deleteOne").mockRejectedValueOnce(new Error("database unavailable"));
    try {
      expect((await paymentService.DeletePaymentMethod({ customerId: customer._id, paymentMethodId: method._id })).success).toBe(false);
    } finally { write.mockRestore(); }
    const originalCommand = stripe.paymentMethods.detach.mock.calls.at(-1);
    expect(await PaymentMethod.findById(method._id)).toBeTruthy();
    expect((await paymentService.DeletePaymentMethod({ customerId: customer._id, paymentMethodId: method._id })).success).toBe(true);
    expect(stripe.paymentMethods.detach.mock.calls.at(-1)).toEqual(originalCommand);
    expect(await PaymentMethod.findById(method._id)).toBeNull();
  });

  test("a held customer card lease blocks changing and deleting cards", async () => {
    const customer = await createCustomer();
    const method = await PaymentMethod.create({ customer: customer._id, provider: "stripe", providerReference: "pm_busy", type: "card" });
    await Customer.updateOne({ _id: customer._id }, { $set: { paymentMethodLock: { token: "worker", expiresAt: new Date(Date.now() + 120000) } } });
    await expect(paymentService.SetDefaultPaymentMethod({ customerId: customer._id, paymentMethodId: method._id })).rejects.toThrow("in progress");
    expect((await paymentService.DeletePaymentMethod({ customerId: customer._id, paymentMethodId: method._id })).success).toBe(false);
    expect(stripe.customers.update).not.toHaveBeenCalled();
    expect(stripe.paymentMethods.detach).not.toHaveBeenCalled();
    await Customer.updateOne({ _id: customer._id }, { $set: { "paymentMethodLock.expiresAt": new Date(0) } });
    stripe.paymentMethods.retrieve.mockResolvedValueOnce({ type: "card", customer: "cus_existing" });
    expect((await paymentService.SetDefaultPaymentMethod({ customerId: customer._id, paymentMethodId: method._id })).success).toBe(true);
  });

});
