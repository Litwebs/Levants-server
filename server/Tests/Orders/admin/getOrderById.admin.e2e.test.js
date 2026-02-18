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

describe("GET /api/admin/orders/:id (Admin)", () => {
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

  test("returns order by id for admin", async () => {
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
      paidAt: new Date(),
      reservationExpiresAt: new Date(),
    });

    const res = await request(app)
      .get(`/api/admin/orders/${order._id}`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;

    expect(data._id).toBe(order._id.toString());
    expect(data.customer).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBe(1);
    expect(data.total).toBe(variant.price);
    expect(data.status).toBe("paid");
  });

  test("returns 404 when order does not exist", async () => {
    const adminCookie = await loginAsAdmin(app);

    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .get(`/api/admin/orders/${fakeId}`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test("returns 400 for invalid order id", async () => {
    const adminCookie = await loginAsAdmin(app);

    const res = await request(app)
      .get("/api/admin/orders/not-a-valid-id")
      .set("Cookie", adminCookie);

    expect(res.status).toBe(400);
  });

  test("fails when not authenticated", async () => {
    const res = await request(app).get(
      "/api/admin/orders/64c000000000000000000000",
    );

    expect(res.status).toBe(401);
  });

  test("fails when authenticated but not admin", async () => {
    const userCookie = await loginAsUser(app);

    const res = await request(app)
      .get("/api/admin/orders/64c000000000000000000000")
      .set("Cookie", userCookie);

    expect(res.status).toBe(403);
  });

  test("returns refund info when order is refunded", async () => {
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
      status: "refunded",
      paidAt: new Date(),
      refund: {
        refundedAt: new Date(),
        refundedBy: customer._id,
        reason: "Customer request",
        restock: true,
        stripeRefundId: "re_test_123",
      },
      reservationExpiresAt: new Date(),
    });

    const res = await request(app)
      .get(`/api/admin/orders/${order._id}`)
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.refund).toBeDefined();
    expect(res.body.data.refund.stripeRefundId).toBe("re_test_123");
  });
});
