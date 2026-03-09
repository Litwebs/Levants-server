const request = require("supertest");

jest.mock("../../../Integration/Email.service", () =>
  jest.fn(async () => ({ success: true, response: { id: "email_test" } })),
);

const app = require("../../testApp");

const mongoose = require("mongoose");

const DeliveryBatch = require("../../../models/deliveryBatch.model");
const Stop = require("../../../models/stop.model");
const Order = require("../../../models/order.model");

const { loginAsAdmin } = require("../../helpers/loginAs");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../../Orders/helpers/orderFactory");

describe("PATCH /api/admin/delivery/batch/:batchId/dispatch (E2E)", () => {
  test("marks orders as dispatched and emails customers with rounded ETA window", async () => {
    const adminCookie = await loginAsAdmin(app);
    const sendEmail = require("../../../Integration/Email.service");

    const customer1 = await createCustomer();
    const customer2 = await createCustomer();

    const product = await createProduct();
    const variant = await createVariant({ product });

    const item = {
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: variant.price,
      quantity: 1,
      subtotal: variant.price,
    };

    const order1 = await createOrder({
      status: "paid",
      items: [item],
      customer: customer1,
      overrides: {
        deliveryStatus: "ordered",
        paidAt: new Date(),
      },
    });

    const order2 = await createOrder({
      status: "paid",
      items: [item],
      customer: customer2,
      overrides: {
        deliveryStatus: "ordered",
        paidAt: new Date(),
      },
    });

    const deliveryDate = new Date(Date.UTC(2026, 2, 9, 0, 0, 0)); // 9 Mar 2026

    const routeId = new mongoose.Types.ObjectId();

    const batch = await DeliveryBatch.create({
      deliveryDate,
      status: "routes_generated",
      orders: [order1._id, order2._id],
      routes: [routeId],
    });

    // ETA examples (Europe/London is GMT on 9 Mar 2026):
    // 09:35 => window 08:30 - 10:30
    // 09:05 => window 08:00 - 10:00
    const eta1 = new Date(Date.UTC(2026, 2, 9, 9, 35, 0));
    const eta2 = new Date(Date.UTC(2026, 2, 9, 9, 5, 0));

    await Stop.create({
      route: routeId,
      order: order1._id,
      sequence: 1,
      estimatedArrival: eta1,
    });

    await Stop.create({
      route: routeId,
      order: order2._id,
      sequence: 2,
      estimatedArrival: eta2,
    });

    const res = await request(app)
      .patch(`/api/admin/delivery/batch/${batch._id}/dispatch`)
      .set("Cookie", adminCookie)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated1 = await Order.findById(order1._id).lean();
    const updated2 = await Order.findById(order2._id).lean();

    expect(updated1.deliveryStatus).toBe("dispatched");
    expect(updated2.deliveryStatus).toBe("dispatched");

    expect(updated1.metadata?.dispatchedEmailSentAt).toBeTruthy();
    expect(updated2.metadata?.dispatchedEmailSentAt).toBeTruthy();

    expect(sendEmail).toHaveBeenCalledTimes(2);

    const callsByTo = new Map(sendEmail.mock.calls.map((c) => [c[0], c]));

    const call1 = callsByTo.get(customer1.email);
    const call2 = callsByTo.get(customer2.email);

    expect(call1).toBeTruthy();
    expect(call2).toBeTruthy();

    {
      const [_to, subject, templateName, params] = call1;
      expect(String(subject)).toMatch(/dispatched/i);
      expect(templateName).toBe("orderDispatched");
      expect(params.orderId).toBe(updated1.orderId);
      expect(params.etaWindowStart).toBe("08:30");
      expect(params.etaWindowEnd).toBe("10:30");
    }

    {
      const [_to, subject, templateName, params] = call2;
      expect(String(subject)).toMatch(/dispatched/i);
      expect(templateName).toBe("orderDispatched");
      expect(params.orderId).toBe(updated2.orderId);
      expect(params.etaWindowStart).toBe("08:00");
      expect(params.etaWindowEnd).toBe("10:00");
    }

    // Calling again should NOT resend.
    const res2 = await request(app)
      .patch(`/api/admin/delivery/batch/${batch._id}/dispatch`)
      .set("Cookie", adminCookie)
      .send({});

    expect(res2.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});
