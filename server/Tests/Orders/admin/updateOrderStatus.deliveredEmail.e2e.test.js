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

describe("PUT /api/admin/orders/:orderId/status (customer emails)", () => {
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

    const proofUrl =
      "https://res.cloudinary.com/levants/image/upload/v123/delivery-proofs/pod.heic";

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

    const [to, subject, templateName, params, options] =
      sendEmail.mock.calls[0];
    expect(to).toBe(customer.email);
    expect(String(subject)).toMatch(/delivered/i);
    expect(templateName).toBe("deliveryProof");
    expect(params.orderId).toBeDefined();
    expect(params.proofUrl).toBe(proofUrl);
    expect(params.proofSrc).toBe("cid:delivery-proof-photo");
    expect(options).toEqual({
      fromName: "Levants",
      attachments: [
        {
          filename: "delivery-proof.jpg",
          path: "https://res.cloudinary.com/levants/image/upload/f_jpg,q_auto:good,w_1200,c_limit/v123/delivery-proofs/pod.heic",
          contentId: "delivery-proof-photo",
        },
      ],
    });

    const updated = await Order.findById(order._id);
    expect(updated.deliveryStatus).toBe("delivered");
    expect(updated.metadata.deliveryProofUrl).toBe(proofUrl);
    expect(updated.metadata.deliveredEmailSentAt).toBeTruthy();
    expect(updated.statusAudit).toHaveLength(1);
    expect(updated.statusAudit[0]).toMatchObject({
      from: "in_transit",
      to: "delivered",
      source: "admin",
    });
    expect(updated.statusAudit[0].actorName).toBeTruthy();
    expect(updated.statusAudit[0].effects).toEqual(
      expect.arrayContaining([
        "Recorded delivery completion time",
        "Attached delivery proof",
        "Sent the delivery confirmation email",
      ]),
    );
    expect(updated.emailLog).toHaveLength(1);
    expect(updated.emailLog[0]).toMatchObject({
      template: "deliveryProof",
      providerId: "email_test",
      to: customer.email,
      trigger: "status_delivered",
    });

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
    const afterSecondUpdate = await Order.findById(order._id);
    expect(afterSecondUpdate.statusAudit).toHaveLength(1);
  });

  test("sends one in-transit email and records it", async () => {
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
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toBe(customer.email);
    expect(sendEmail.mock.calls[0][2]).toBe("orderInTransit");

    const updated = await Order.findById(order._id);
    expect(updated.metadata.inTransitEmailSentAt).toBeTruthy();
    expect(updated.emailLog[0]).toMatchObject({
      template: "orderInTransit",
      to: customer.email,
      trigger: "status_in_transit",
    });

    const repeated = await request(app)
      .put(`/api/admin/orders/${order._id}/status`)
      .set("Cookie", adminCookie)
      .send({ deliveryStatus: "in_transit" });
    expect(repeated.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  test("sends one dispatch email for a manual single-order dispatch", async () => {
    const adminCookie = await loginAsAdmin(app);
    const sendEmail = require("../../../Integration/Email.service");
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product });
    const order = await Order.create({
      customer: customer._id,
      items: [{
        product: product._id,
        variant: variant._id,
        name: variant.name,
        sku: variant.sku,
        price: variant.price,
        quantity: 1,
        subtotal: variant.price,
      }],
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

    const dispatch = () => request(app)
      .put(`/api/admin/orders/${order._id}/status`)
      .set("Cookie", adminCookie)
      .send({ deliveryStatus: "dispatched" });

    expect((await dispatch()).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toBe(customer.email);
    expect(sendEmail.mock.calls[0][2]).toBe("orderDispatched");

    const updated = await Order.findById(order._id);
    expect(updated.metadata.dispatchedEmailSentAt).toBeTruthy();
    expect(updated.emailLog).toHaveLength(1);
    expect(updated.emailLog[0]).toMatchObject({
      template: "orderDispatched",
      to: customer.email,
      trigger: "status_dispatched",
    });
    expect(updated.statusAudit[0].effects).toContain(
      "Sent the dispatch notification email",
    );

    // Repeating the current status must not resend or add another audit step.
    expect((await dispatch()).status).toBe(200);
    const advanceResponse = await request(app)
      .put(`/api/admin/orders/${order._id}/status`)
      .set("Cookie", adminCookie)
      .send({ deliveryStatus: "in_transit" });
    expect(advanceResponse.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls[1][2]).toBe("orderInTransit");

    // Once advanced, returning to dispatched is rejected by the server.
    expect((await dispatch()).status).toBe(409);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const finalOrder = await Order.findById(order._id);
    expect(finalOrder.deliveryStatus).toBe("in_transit");
    expect(finalOrder.metadata.inTransitEmailSentAt).toBeTruthy();
    expect(finalOrder.statusAudit).toHaveLength(2);
  });

  test("does not resend dispatch email when the order was already notified", async () => {
    const adminCookie = await loginAsAdmin(app);
    const sendEmail = require("../../../Integration/Email.service");
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product });
    const sentAt = new Date();
    const order = await Order.create({
      customer: customer._id,
      items: [{
        product: product._id,
        variant: variant._id,
        name: variant.name,
        sku: variant.sku,
        price: variant.price,
        quantity: 1,
        subtotal: variant.price,
      }],
      subtotal: variant.price,
      deliveryAddress: getValidDeliveryAddress(),
      location: getValidLocation(),
      deliveryFee: 0,
      total: variant.price,
      status: "paid",
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(),
      paidAt: new Date(),
      metadata: { dispatchedEmailSentAt: sentAt },
    });

    const response = await request(app)
      .put(`/api/admin/orders/${order._id}/status`)
      .set("Cookie", adminCookie)
      .send({ deliveryStatus: "dispatched" });

    expect(response.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
    const updated = await Order.findById(order._id);
    expect(updated.metadata.dispatchedEmailSentAt.getTime()).toBe(sentAt.getTime());
  });
});
