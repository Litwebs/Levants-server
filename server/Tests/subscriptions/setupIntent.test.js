const Customer = require("../../models/customer.model");
const stripe = require("../../utils/stripe.util");
const paymentService = require("../../services/customerPortal/customerPayments.service");

describe("customer subscription SetupIntent", () => {
  test("creates an off-session card-only SetupIntent and does not enable automatic payment methods", async () => {
    const customer = await Customer.create({
      email: `setup-intent-${Date.now()}@example.com`,
      firstName: "Setup",
      lastName: "Intent",
      isGuest: false,
      stripeCustomerId: "cus_setup_intent",
    });

    stripe.setupIntents.create.mockClear();

    const result = await paymentService.CreateSetupIntent({
      customerId: customer._id,
    });

    expect(result.success).toBe(true);
    expect(result.data.clientSecret).toBe("seti_test_secret_test");
    expect(result.data.publishableKey).toBe("pk_test_123");

    expect(stripe.setupIntents.create).toHaveBeenCalledTimes(1);
    expect(stripe.setupIntents.create).toHaveBeenCalledWith({
      customer: "cus_setup_intent",
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: {
        customerId: String(customer._id),
      },
    });

    const options = stripe.setupIntents.create.mock.calls[0][0];
    expect(options).not.toHaveProperty("automatic_payment_methods");
  });
});
