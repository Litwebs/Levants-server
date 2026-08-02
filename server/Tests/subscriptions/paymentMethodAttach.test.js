const Customer = require("../../models/customer.model");
const PaymentMethod = require("../../models/paymentMethod.model");
const stripe = require("../../utils/stripe.util");
const paymentService = require("../../services/customerPortal/customerPayments.service");

describe("customer payment method attachment", () => {
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
    });
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
});
