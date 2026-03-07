const request = require("supertest");

jest.mock("../../../services/files.service", () => {
  const mongoose = require("mongoose");
  return {
    uploadAndCreateFile: jest.fn(async () => ({
      success: true,
      data: {
        _id: new mongoose.Types.ObjectId(),
        url: "https://cdn.test.com/delivery-proof.jpg",
      },
    })),
  };
});

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

describe("PUT /api/admin/orders/:orderId/status (Delivery proof upload)", () => {
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

  test("uploads proof image and attaches it to order metadata", async () => {
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
      deliveryStatus: "in_transit",
      reservationExpiresAt: new Date(),
      paidAt: new Date(),
    });

    const fakeJpg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);

    const res = await request(app)
      .put(`/api/admin/orders/${order._id}/status`)
      .set("Cookie", adminCookie)
      .field("deliveryStatus", "delivered")
      .attach("deliveryProof", fakeJpg, {
        filename: "proof.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await Order.findById(order._id);
    expect(updated.deliveryStatus).toBe("delivered");
    expect(updated.metadata.deliveryProofUrl).toBe(
      "https://cdn.test.com/delivery-proof.jpg",
    );
    expect(updated.metadata.deliveryProofFileId).toBeTruthy();
  });
});
