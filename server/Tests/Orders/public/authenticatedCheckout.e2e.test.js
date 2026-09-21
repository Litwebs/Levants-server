jest.mock("../../../Integration/Email.service", () =>
  jest.fn(async () => ({ success: true, response: { id: "email_test" } })),
);

const request = require("supertest");
const app = require("../../testApp");
const jwtUtil = require("../../../utils/jwt.util");
const stripe = require("../../../utils/stripe.util");

const Order = require("../../../models/order.model");
const CustomerNotification = require("../../../models/customerNotification.model");
const StoreCreditTransaction = require("../../../models/storeCreditTransaction.model");

const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../helpers/orderFactory");

describe("authenticated one-time checkout", () => {
  const deliveryAddress = {
    line1: "10 Downing Street",
    line2: "",
    city: "London",
    postcode: "SW1A 2AA",
    country: "United Kingdom",
  };

  async function registeredCustomer({ creditBalance = 0 } = {}) {
    const customer = await createCustomer();
    customer.isGuest = false;
    customer.status = "active";
    customer.creditBalance = creditBalance;
    await customer.save();
    return customer;
  }

  function authHeader(customer) {
    return {
      Authorization: `Bearer ${jwtUtil.signCustomerAccessToken(customer)}`,
    };
  }

  test("portal customer checkout uses the authenticated customer and can apply store credit", async () => {
    const customer = await registeredCustomer({ creditBalance: 500 });
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10, price: 5 });

    const res = await request(app)
      .post("/api/portal/orders/checkout")
      .set(authHeader(customer))
      .send({
        items: [{ variantId: String(variant._id), quantity: 1 }],
        deliveryAddress,
        creditToApplyMinor: 500,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orderId).toBeTruthy();
    expect(res.body.data.checkoutUrl).toBeTruthy();

    const order = await Order.findById(res.body.data.orderId).lean();
    expect(String(order.customer)).toBe(String(customer._id));
    expect(order.status).toBe("pending");
    expect(order.creditApplied).toBe(500);

    expect(stripe.coupons.create).toHaveBeenCalledTimes(1);
    expect(stripe.coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_off: 500,
        currency: "gbp",
        duration: "once",
      }),
    );

    const stripeArgs = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(stripeArgs.success_url).toContain(
      "/checkout/success?session_id={CHECKOUT_SESSION_ID}",
    );
    expect(stripeArgs.metadata.orderId).toBe(String(order._id));
    expect(stripeArgs.metadata.creditAppliedMinor).toBe("500");
  });

  test("portal checkout rejects a browser-supplied customerId", async () => {
    const customer = await registeredCustomer();
    const otherCustomer = await registeredCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10 });

    const res = await request(app)
      .post("/api/portal/orders/checkout")
      .set(authHeader(customer))
      .send({
        customerId: String(otherCustomer._id),
        items: [{ variantId: String(variant._id), quantity: 1 }],
        deliveryAddress,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/customerId.*not allowed|not allowed.*customerId/i);
    expect(await Order.countDocuments()).toBe(0);
  });

  test("public guest order endpoint cannot spend account store credit", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10 });

    const res = await request(app)
      .post("/api/orders")
      .send({
        customerId: String(customer._id),
        items: [{ variantId: String(variant._id), quantity: 1 }],
        deliveryAddress,
        creditToApplyMinor: 100,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/creditToApplyMinor.*not allowed|not allowed.*creditToApplyMinor/i);
    expect(await Order.countDocuments()).toBe(0);
  });

  test("legacy portal order creation and reorder endpoints are removed", async () => {
    const customer = await registeredCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10 });

    const createRes = await request(app)
      .post("/api/portal/orders")
      .set(authHeader(customer))
      .send({
        items: [{ variantId: String(variant._id), quantity: 1 }],
        deliveryAddress,
      });
    expect(createRes.status).toBe(404);

    const order = await createOrder({
      customer,
      status: "paid",
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: variant.price,
          quantity: 1,
          subtotal: variant.price,
        },
      ],
    });

    const reorderRes = await request(app)
      .post(`/api/portal/orders/${order._id}/reorder`)
      .set(authHeader(customer))
      .send({});
    expect(reorderRes.status).toBe(404);
  });

  test("browser return reconciles a paid Stripe session into a visible paid order exactly once", async () => {
    const customer = await registeredCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10, price: 5 });

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
          quantity: 1,
          subtotal: variant.price,
        },
      ],
      overrides: {
        subtotal: 5,
        deliveryFee: 1,
        total: 6,
        stripeCheckoutSessionId: "cs_test_browser_return",
        reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    variant.reservedQuantity = 1;
    await variant.save();

    const paidSession = {
      id: "cs_test_browser_return",
      payment_status: "paid",
      payment_intent: "pi_test_browser_return",
      amount_subtotal: 600,
      amount_total: 600,
      total_details: { amount_discount: 0 },
      currency: "gbp",
      created: Math.floor(Date.now() / 1000),
      metadata: { orderId: String(order._id) },
    };
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession);

    const first = await request(app)
      .post("/api/orders/checkout/confirm")
      .send({ checkoutSessionId: paidSession.id });

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(String(first.body.data.orderId)).toBe(String(order._id));
    expect(first.body.data.status).toBe("paid");

    const afterFirst = await Order.findById(order._id).lean();
    const afterVariant = await variant.constructor.findById(variant._id).lean();
    expect(afterFirst.status).toBe("paid");
    expect(afterFirst.stripePaymentIntentId).toBe("pi_test_browser_return");
    expect(afterVariant.stockQuantity).toBe(9);
    expect(afterVariant.reservedQuantity).toBe(0);
    expect(afterFirst.metadata?.orderConfirmationSentAt).toBeTruthy();

    const notificationCount = await CustomerNotification.countDocuments({
      customer: customer._id,
      type: "order_confirmed",
      relatedOrder: order._id,
    });
    expect(notificationCount).toBe(1);

    const second = await request(app)
      .post("/api/orders/checkout/confirm")
      .send({ checkoutSessionId: paidSession.id });

    expect(second.status).toBe(200);
    expect(second.body.success).toBe(true);

    const afterSecondVariant = await variant.constructor
      .findById(variant._id)
      .lean();
    expect(afterSecondVariant.stockQuantity).toBe(9);
    expect(
      await CustomerNotification.countDocuments({
        customer: customer._id,
        type: "order_confirmed",
        relatedOrder: order._id,
      }),
    ).toBe(1);
  });

  test("browser return does not finalize an unpaid Stripe session", async () => {
    const customer = await registeredCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10, price: 5 });
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
          quantity: 1,
          subtotal: variant.price,
        },
      ],
      overrides: {
        stripeCheckoutSessionId: "cs_test_unpaid_return",
        reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    stripe.checkout.sessions.retrieve.mockResolvedValue({
      id: "cs_test_unpaid_return",
      payment_status: "unpaid",
      metadata: { orderId: String(order._id) },
    });

    const res = await request(app)
      .post("/api/orders/checkout/confirm")
      .send({ checkoutSessionId: "cs_test_unpaid_return" });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not complete/i);

    const unchanged = await Order.findById(order._id).lean();
    expect(unchanged.status).toBe("pending");
  });
});
