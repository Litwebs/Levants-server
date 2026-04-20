jest.mock("../../../services/discounts.public.service", () => ({
  recordRedemption: jest.fn(async () => {}),
}));

jest.mock("../../../services/orders.notifications.service", () => ({
  sendNewOrderAlertEmailToUsers: jest.fn(async () => {}),
  sendOrderConfirmationEmailToCustomer: jest.fn(async () => {}),
  sendRefundConfirmationEmailToCustomer: jest.fn(async () => {}),
}));

const Order = require("../../../models/order.model");
const webhookService = require("../../../services/orders.webhook.service");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../helpers/orderFactory");

describe("HandlePaymentSuccess", () => {
  test("syncs paid website order totals with stripe checkout amounts", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 12.34, stock: 10 });

    const order = await createOrder({
      customer,
      status: "pending",
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: variant.price,
          quantity: 2,
          subtotal: variant.price * 2,
        },
      ],
      overrides: {
        subtotal: 24.68,
        deliveryFee: 1,
        total: 22,
        totalBeforeDiscount: 25.68,
        discountAmount: 3.68,
        reservationExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    await webhookService.HandlePaymentSuccess({
      id: "cs_test_123",
      payment_intent: "pi_test_456",
      currency: "gbp",
      amount_subtotal: 2568,
      amount_total: 2200,
      total_details: {
        amount_discount: 368,
      },
      created: 1713436800,
      metadata: {
        orderId: String(order._id),
      },
    });

    const updated = await Order.findById(order._id).lean();

    expect(updated.status).toBe("paid");
    expect(updated.currency).toBe("GBP");
    expect(updated.subtotal).toBeCloseTo(24.68, 2);
    expect(updated.deliveryFee).toBe(1);
    expect(updated.totalBeforeDiscount).toBeCloseTo(25.68, 2);
    expect(updated.discountAmount).toBeCloseTo(3.68, 2);
    expect(updated.total).toBeCloseTo(22, 2);
    expect(updated.stripeCheckoutSessionId).toBe("cs_test_123");
    expect(updated.stripePaymentIntentId).toBe("pi_test_456");
    expect(updated.paidAt).toBeTruthy();
  });
});
