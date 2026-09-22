const request = require("supertest");
const app = require("../../testApp");
const stripe = require("../../../utils/stripe.util");
const jwtUtil = require("../../../utils/jwt.util");
const Order = require("../../../models/order.model");
const Customer = require("../../../models/customer.model");
const CustomerNotification = require("../../../models/customerNotification.model");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../helpers/orderFactory");
const {
  ReconcileCheckoutSession,
} = require("../../../services/orders/orders.webhook.service");
const {
  runOrderExpirationJob,
} = require("../../../scripts/orderExpiration.scheduler");

const address = {
  line1: "10 Downing Street",
  line2: "",
  city: "London",
  postcode: "SW1A 2AA",
  country: "United Kingdom",
};

async function createRegisteredCustomer({ creditBalance = 0 } = {}) {
  const customer = await createCustomer();
  customer.isGuest = false;
  customer.status = "active";
  customer.creditBalance = creditBalance;
  await customer.save();
  return customer;
}

describe("authenticated one-time checkout", () => {
  test("guest/public checkout cannot submit account store credit", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10, price: 5 });

    const res = await request(app)
      .post("/api/orders")
      .send({
        customerId: String(customer._id),
        items: [{ variantId: String(variant._id), quantity: 1 }],
        deliveryAddress: address,
        creditToApplyMinor: 100,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  test("portal checkout derives the customer from auth and exposes store credit to the real checkout service", async () => {
    const customer = await createRegisteredCustomer({ creditBalance: 500 });
    const otherCustomer = await createRegisteredCustomer({ creditBalance: 5000 });
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10, price: 10 });
    const token = jwtUtil.signCustomerAccessToken(customer);

    const res = await request(app)
      .post("/api/portal/orders/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ variantId: String(variant._id), quantity: 1 }],
        deliveryAddress: address,
        creditToApplyMinor: 500,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.checkoutUrl).toBeTruthy();

    const order = await Order.findById(res.body.data.orderId).lean();
    expect(String(order.customer)).toBe(String(customer._id));
    expect(String(order.customer)).not.toBe(String(otherCustomer._id));
    expect(order.creditApplied).toBe(500);

    const stripeArgs = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(stripeArgs.success_url).toContain(
      "/checkout/success?session_id={CHECKOUT_SESSION_ID}",
    );
    expect(stripeArgs.metadata.orderId).toBe(String(order._id));
    expect(stripeArgs.metadata.creditAppliedMinor).toBe("500");
  });

  test("deleted legacy portal create endpoint no longer accepts orders", async () => {
    const customer = await createRegisteredCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10, price: 5 });
    const token = jwtUtil.signCustomerAccessToken(customer);

    const res = await request(app)
      .post("/api/portal/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ variantId: String(variant._id), quantity: 1 }],
        deliveryAddress: address,
      });

    expect(res.status).toBe(404);
  });

  test("browser reconciliation finalizes a paid Stripe session and makes the order visible", async () => {
    const customer = await createRegisteredCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10, price: 7 });
    const order = await createOrder({
      customer,
      status: "pending",
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: 7,
          quantity: 1,
          subtotal: 7,
        },
      ],
      overrides: {
        deliveryFee: 1,
        subtotal: 7,
        total: 8,
        totalBeforeDiscount: 8,
        stripeCheckoutSessionId: "cs_reconcile_paid",
        reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    await variant.constructor.findByIdAndUpdate(variant._id, {
      $set: { reservedQuantity: 1 },
    });

    stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
      id: "cs_reconcile_paid",
      payment_status: "paid",
      payment_intent: "pi_reconcile_paid",
      currency: "gbp",
      amount_subtotal: 800,
      amount_total: 800,
      total_details: { amount_discount: 0 },
      created: Math.floor(Date.now() / 1000),
      metadata: { orderId: String(order._id) },
    });

    const result = await ReconcileCheckoutSession({
      checkoutSessionId: "cs_reconcile_paid",
    });

    expect(result.success).toBe(true);
    expect(String(result.data.orderId)).toBe(String(order._id));

    const paid = await Order.findById(order._id).lean();
    expect(paid.status).toBe("paid");
    expect(paid.stripePaymentIntentId).toBe("pi_reconcile_paid");

    const notification = await CustomerNotification.findOne({
      customer: customer._id,
      relatedOrder: order._id,
      type: "order_confirmed",
    }).lean();
    expect(notification).toBeTruthy();

    const token = jwtUtil.signCustomerAccessToken(customer);
    const visible = await request(app)
      .get("/api/portal/orders")
      .set("Authorization", `Bearer ${token}`);
    expect(visible.status).toBe(200);
    expect(
      visible.body.data.orders.some(
        (candidate) => String(candidate._id) === String(order._id),
      ),
    ).toBe(true);
  });

  test("expiry job reconciles a paid Stripe session instead of cancelling it", async () => {
    const customer = await createRegisteredCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10, price: 6 });
    const order = await createOrder({
      customer,
      status: "pending",
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: 6,
          quantity: 1,
          subtotal: 6,
        },
      ],
      overrides: {
        deliveryFee: 1,
        subtotal: 6,
        total: 7,
        totalBeforeDiscount: 7,
        stripeCheckoutSessionId: "cs_expired_but_paid",
        reservationExpiresAt: new Date(Date.now() - 60 * 1000),
      },
    });
    await variant.constructor.findByIdAndUpdate(variant._id, {
      $set: { reservedQuantity: 1 },
    });

    stripe.checkout.sessions.retrieve.mockImplementation(async (sessionId) => {
      if (sessionId === "cs_expired_but_paid") {
        return {
          id: sessionId,
          payment_status: "paid",
          payment_intent: "pi_expired_but_paid",
          currency: "gbp",
          amount_subtotal: 700,
          amount_total: 700,
          total_details: { amount_discount: 0 },
          created: Math.floor(Date.now() / 1000),
          metadata: { orderId: String(order._id) },
        };
      }
      return {
        id: sessionId,
        payment_status: "unpaid",
        metadata: {},
      };
    });

    await runOrderExpirationJob();

    const updated = await Order.findById(order._id).lean();
    expect(updated.status).toBe("paid");
    expect(updated.stripePaymentIntentId).toBe("pi_expired_but_paid");
    expect(updated.expiresAt).toBeFalsy();
  });
});
