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

describe("PUT /api/admin/orders/bulk/delivery-status (Delivered email)", () => {
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

  test("sends delivered emails for orders transitioning to delivered", async () => {
    const adminCookie = await loginAsAdmin(app);
    const sendEmail = require("../../../Integration/Email.service");

    const customer1 = await createCustomer();
    const customer2 = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product });

    const order1 = await Order.create({
      customer: customer1._id,
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
      metadata: { deliveryProofUrl: "https://cdn.test.com/pod-1.jpg" },
    });

    const order2 = await Order.create({
      customer: customer2._id,
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
      deliveryStatus: "dispatched",
      reservationExpiresAt: new Date(),
      paidAt: new Date(),
    });

    const res = await request(app)
      .put("/api/admin/orders/bulk/delivery-status")
      .set("Cookie", adminCookie)
      .send({
        orderIds: [String(order1._id), String(order2._id)],
        deliveryStatus: "delivered",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect(sendEmail).toHaveBeenCalledTimes(2);

    const updated1 = await Order.findById(order1._id);
    const updated2 = await Order.findById(order2._id);

    expect(updated1.deliveryStatus).toBe("delivered");
    expect(updated2.deliveryStatus).toBe("delivered");

    expect(updated1.metadata.deliveredEmailSentAt).toBeTruthy();
    expect(updated2.metadata.deliveredEmailSentAt).toBeTruthy();

    // Calling again should NOT resend
    const res2 = await request(app)
      .put("/api/admin/orders/bulk/delivery-status")
      .set("Cookie", adminCookie)
      .send({
        orderIds: [String(order1._id), String(order2._id)],
        deliveryStatus: "delivered",
      });

    expect(res2.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});
