const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../testApp");

const Order = require("../../../models/order.model");

const { loginAsAdmin, loginAsUser } = require("../../helpers/loginAs");
const {
  createCustomer,
  createProduct,
  createVariant,
} = require("../helpers/orderFactory");

jest.mock("../../../utils/stripe.util", () => ({
  refunds: {
    create: jest.fn(async () => ({
      id: "re_test_123",
      status: "pending",
    })),
  },
  checkout: {
    sessions: {
      retrieve: jest.fn(async () => ({
        payment_intent: "pi_test_123",
      })),
    },
  },
}));

describe("POST /api/admin/orders/:id/refund (Admin)", () => {
  const getValidDeliveryAddress = () => ({
    line1: "10 Downing Street",
    line2: "",
    city: "London",
    postcode: "SW1A 2AA",
    country: "United Kingdom",
  });

  const getValidLocation = () => ({
    lat: 51.5033635,
    lng: -0.1276248,
  });

  test("successfully initiates refund (no restock)", async () => {
    const adminCookie = await loginAsAdmin(app);

    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product });

    const order = await Order.create({
      customer: customer._id,
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
      subtotal: variant.price,
      deliveryAddress: getValidDeliveryAddress(),
      location: getValidLocation(),
      deliveryFee: 0,
      total: variant.price,
      status: "paid",
      stripePaymentIntentId: "pi_test_123",
      reservationExpiresAt: new Date(),
      paidAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/admin/orders/${order._id}/refund`)
      .set("Cookie", adminCookie)
      .send({
        reason: "Customer request",
        restock: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.refundId).toBe("re_test_123");

    const updated = await Order.findById(order._id);
    expect(updated.status).toBe("refund_pending");
    expect(updated.refund.stripeRefundId).toBe("re_test_123");
    expect(updated.refund.restock).toBe(false);
  });

  test("successfully initiates refund with restock flag", async () => {
    const adminCookie = await loginAsAdmin(app);

    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({
      product,
      stockQuantity: 5,
    });

    const order = await Order.create({
      customer: customer._id,
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
      subtotal: variant.price * 2,
      deliveryAddress: getValidDeliveryAddress(),
      location: getValidLocation(),
      deliveryFee: 0,
      total: variant.price * 2,
      status: "paid",
      stripePaymentIntentId: "pi_test_123",
      reservationExpiresAt: new Date(),
      paidAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/admin/orders/${order._id}/refund`)
      .set("Cookie", adminCookie)
      .send({
        reason: "Admin goodwill",
        restock: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await Order.findById(order._id);
    expect(updated.status).toBe("refund_pending");
    expect(updated.refund.restock).toBe(true);
  });

  test("fails when not authenticated", async () => {
    const res = await request(app).post(
      "/api/admin/orders/64c000000000000000000000/refund",
    );

    expect(res.status).toBe(401);
  });

  test("fails when authenticated but not admin", async () => {
    const userCookie = await loginAsUser(app);

    const res = await request(app)
      .post("/api/admin/orders/64c000000000000000000000/refund")
      .set("Cookie", userCookie);

    expect(res.status).toBe(403);
  });

  test("fails when order does not exist", async () => {
    const adminCookie = await loginAsAdmin(app);
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .post(`/api/admin/orders/${fakeId}/refund`)
      .set("Cookie", adminCookie)
      .send({ restock: false });

    expect(res.status).toBe(404);
  });

  test("fails when order is not paid", async () => {
    const adminCookie = await loginAsAdmin(app);

    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product });

    const order = await Order.create({
      customer: customer._id,
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
      subtotal: variant.price,
      deliveryAddress: getValidDeliveryAddress(),
      location: getValidLocation(),
      deliveryFee: 0,
      total: variant.price,
      status: "pending",
      reservationExpiresAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/admin/orders/${order._id}/refund`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(400);
  });

  test("fails when refund already initiated", async () => {
    const adminCookie = await loginAsAdmin(app);

    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product });

    const order = await Order.create({
      customer: customer._id,
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
      subtotal: variant.price,
      deliveryAddress: getValidDeliveryAddress(),
      location: getValidLocation(),
      deliveryFee: 0,
      total: variant.price,
      status: "refund_pending",
      refund: {
        stripeRefundId: "re_existing",
      },
      reservationExpiresAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/admin/orders/${order._id}/refund`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(409);
  });

  test("fails cleanly when Stripe refund throws error", async () => {
    const stripe = require("../../../utils/stripe.util");
    stripe.refunds.create.mockRejectedValueOnce(
      new Error("Stripe unavailable"),
    );

    const adminCookie = await loginAsAdmin(app);

    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product });

    const order = await Order.create({
      customer: customer._id,
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
      subtotal: variant.price,
      deliveryAddress: getValidDeliveryAddress(),
      location: getValidLocation(),
      deliveryFee: 0,
      total: variant.price,
      status: "paid",
      stripePaymentIntentId: "pi_test_123",
      reservationExpiresAt: new Date(),
      paidAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/admin/orders/${order._id}/refund`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(500);
  });
});
