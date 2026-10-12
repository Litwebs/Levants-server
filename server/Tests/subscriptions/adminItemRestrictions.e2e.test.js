const request = require("supertest");
const app = require("../testApp");
const mongoose = require("mongoose");
const Customer = require("../../models/customer.model");
const Subscription = require("../../models/subscription.model");
const SubscriptionMutation = require("../../models/subscriptionMutation.model");
const Payment = require("../../models/payment.model");
const StoreCreditTransaction = require("../../models/storeCreditTransaction.model");
const stripe = require("../../utils/stripe.util");

const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("Admin subscription item restrictions (E2E)", () => {
  const subscriptionId = "64f000000000000000000001";
  const itemId = "64f000000000000000000002";

  async function loginAdmin() {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });
    return getSetCookieHeader(login);
  }

  test.each([
    ["post", `/api/admin/subscriptions/${subscriptionId}/items`, { variantId: itemId, quantity: 1 }],
    ["patch", `/api/admin/subscriptions/${subscriptionId}/items/${itemId}`, { quantity: 2 }],
    ["delete", `/api/admin/subscriptions/${subscriptionId}/items/${itemId}`, undefined],
  ])("403 blocks admin %s item mutations", async (method, path, body) => {
    const cookie = await loginAdmin();
    let call = request(app)[method](path).set("Cookie", cookie);
    if (body) call = call.send(body);

    const res = await call;

    expect(res.status).toBe(403);
    expect(res.body.message).toBe(
      "Subscription products cannot be changed by admins",
    );
  });

  test.each(["pause", "resume"])(
    "status endpoint %s remains available to admins",
    async (action) => {
      const cookie = await loginAdmin();
      const res = await request(app)
        .post(`/api/admin/subscriptions/${subscriptionId}/${action}`)
        .set("Cookie", cookie);

      // A non-existent ID reaches the status controller and service. This
      // confirms the endpoint remains available rather than being denied.
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Subscription not found");
    },
  );

  test.each([1, 2, 3])(
    "general PATCH rejects day-plan quantity %i without changing subscription or finances",
    async quantity => {
      const cookie = await loginAdmin();
      const customer = await Customer.create({
        email: "admin-plan-test@example.com", firstName: "Portal", lastName: "Customer",
        isGuest: false, creditBalance: 250,
      });
      const item = {
        product: new mongoose.Types.ObjectId(), variant: new mongoose.Types.ObjectId(),
        name: "Milk", sku: "ADMIN-PLAN-TEST", quantity: 2, unitPrice: 2,
      };
      const subscription = await Subscription.create({
        subscriptionNumber: "SUB-ADMIN-PLAN-TEST", customer: customer._id,
        frequency: "weekly", preferredDeliveryDay: 0, preferredDeliveryDays: [0, 3],
        startDate: new Date(), notes: "Original note", items: [item],
        deliveryAddress: { line1: "1 Test Street", city: "Bradford", postcode: "BD1 1AA", country: "GB" },
        deliveryDayPlans: [0, 3].map(day => ({ day, items: [item] })),
      });
      const before = await Subscription.findById(subscription._id).lean();
      const createPayment = jest.spyOn(stripe.paymentIntents, "create");
      const createRefund = jest.spyOn(stripe.refunds, "create");

      const res = await request(app)
        .patch(`/api/admin/subscriptions/${subscription._id}`)
        .set("Cookie", cookie)
        .send({
          expectedVersion: subscription.__v, refundMethod: "credit", notes: "Must not be saved",
          deliveryDayPlans: [0, 3].map(day => ({ day, items: [{ variantId: String(item.variant), quantity }] })),
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Subscription products cannot be changed by admins");
      expect(await Subscription.findById(subscription._id).lean()).toEqual(before);
      expect((await Customer.findById(customer._id)).creditBalance).toBe(250);
      expect(await SubscriptionMutation.countDocuments({ subscription: subscription._id })).toBe(0);
      expect(await Payment.countDocuments({ customer: customer._id })).toBe(0);
      expect(await StoreCreditTransaction.countDocuments({ customer: customer._id })).toBe(0);
      expect(createPayment).not.toHaveBeenCalled();
      expect(createRefund).not.toHaveBeenCalled();
    },
  );
});
