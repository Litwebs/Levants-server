const request = require("supertest");
jest.mock("../../../Integration/Email.service", () =>
  jest.fn(async () => ({ success: true, response: { id: "email_test" } })),
);

const app = require("../../testApp");

const Order = require("../../../models/order.model");

const { loginAsAdmin } = require("../../helpers/loginAs");
const {
  createCustomer,
  createProduct,
  createVariant,
} = require("../helpers/orderFactory");

describe("PUT /api/admin/orders/:orderId/status (Delivered email)", () => {
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

  test("sends delivered email with proof image on transition", async () => {
    const adminCookie = await loginAsAdmin(app);
    const sendEmail = require("../../../Integration/Email.service");

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
      deliveryStatus: "in_transit",
      reservationExpiresAt: new Date(),
      paidAt: new Date(),
    });

    const proofUrl = "https://cdn.test.com/pod.jpg";

    const res = await request(app)
      .put(`/api/admin/orders/${order._id}/status`)
      .set("Cookie", adminCookie)
      .send({
        deliveryStatus: "delivered",
        deliveryProofUrl: proofUrl,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect(sendEmail).toHaveBeenCalledTimes(1);

    const [to, subject, templateName, params] = sendEmail.mock.calls[0];
    expect(to).toBe(customer.email);
    expect(String(subject)).toMatch(/delivered/i);
    expect(templateName).toBe("deliveryProof");
    expect(params.orderId).toBeDefined();
    expect(params.proofUrl).toBe(proofUrl);

    const updated = await Order.findById(order._id);
    expect(updated.deliveryStatus).toBe("delivered");
    expect(updated.metadata.deliveryProofUrl).toBe(proofUrl);
    expect(updated.metadata.deliveredEmailSentAt).toBeTruthy();

    // Calling again should NOT re-send.
    const res2 = await request(app)
      .put(`/api/admin/orders/${order._id}/status`)
      .set("Cookie", adminCookie)
      .send({
        deliveryStatus: "delivered",
        deliveryProofUrl: proofUrl,
      });

    expect(res2.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  test("does not send email for non-delivered statuses", async () => {
    const adminCookie = await loginAsAdmin(app);
    const sendEmail = require("../../../Integration/Email.service");

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
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(),
      paidAt: new Date(),
    });

    const res = await request(app)
      .put(`/api/admin/orders/${order._id}/status`)
      .set("Cookie", adminCookie)
      .send({
        deliveryStatus: "in_transit",
      });

    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(0);
  });
});
