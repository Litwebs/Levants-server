"use strict";

const request = require("supertest");
const app = require("../testApp");
const { createPortalCustomer, loginPortalCustomer } = require("./helpers");
const Product = require("../../models/product.model");
const ProductVariant = require("../../models/variant.model");
const Customer = require("../../models/customer.model");
const Subscription = require("../../models/subscription.model");
const SubscriptionDelivery = require("../../models/subscriptionDelivery.model");
const CustomerNotification = require("../../models/customerNotification.model");
const Order = require("../../models/order.model");
const StoreCreditTransaction = require("../../models/storeCreditTransaction.model");
const stripe = require("../../utils/stripe.util");
const SubscriptionSettings = require("../../models/subscriptionSettings.model");
const subscriptionService = require("../../services/customerPortal/customerSubscriptions.service");
const crypto = require("crypto");

// Mock geocode so tests don't make real HTTP calls
jest.mock("../../Integration/google.geocode", () => ({
  geocodeAddress: jest.fn(async () => ({ lat: 51.5, lng: -0.1 })),
}));

jest.mock("../../utils/stripe.util", () => {
  let priceCounter = 0;
  let subscriptionCounter = 0;
  let productCounter = 0;
  let paymentIntentCounter = 0;
  let refundCounter = 0;

  return {
    customers: {
      retrieve: jest.fn(async () => ({
        id: "cus_test_mock",
        deleted: false,
        invoice_settings: { default_payment_method: "pm_test_default" },
      })),
    },
    products: {
      create: jest.fn(async () => ({ id: `prod_test_${++productCounter}` })),
    },
    prices: {
      create: jest.fn(async () => ({ id: `price_test_${++priceCounter}` })),
      update: jest.fn(async () => ({
        id: "price_test_archived",
        active: false,
      })),
    },
    subscriptions: {
      create: jest.fn(async () => ({
        id: `sub_test_${++subscriptionCounter}`,
      })),
      update: jest.fn(async () => ({ id: "sub_test_updated" })),
      retrieve: jest.fn(async () => ({
        id: "sub_test_existing",
        items: { data: [{ id: "si_test_existing" }] },
      })),
      cancel: jest.fn(async () => ({
        id: "sub_test_cancelled",
        status: "canceled",
      })),
    },
    paymentIntents: {
      create: jest.fn(async () => ({
        id: `pi_test_${++paymentIntentCounter}`,
      })),
    },
    refunds: {
      create: jest.fn(async () => ({ id: `re_test_${++refundCounter}` })),
    },
    testHelpers: {
      testClocks: {
        retrieve: jest.fn(async () => ({
          id: "clock_test",
          frozen_time: null,
        })),
      },
    },
  };
});

async function createTestProduct() {
  const product = await Product.create({
    name: `Test Product ${crypto.randomUUID()}`,
    slug: `test-product-${crypto.randomUUID()}`,
    category: "dairy",
    description: "A test product",
    status: "active",
    isSubscriptionEligible: true,
    thumbnailImage: new (require("mongoose").Types.ObjectId)(),
  });

  const variant = await ProductVariant.create({
    product: product._id,
    name: "500ml",
    sku: `SKU-${crypto.randomUUID()}`,
    price: 2.5,
    stockQuantity: 100,
    status: "active",
  });

  return { product, variant };
}

describe("Portal Subscriptions", () => {
  let accessToken;
  let customer;
  let addressId;
  let variantId;

  beforeEach(async () => {
    const creds = await createPortalCustomer();
    customer = creds.customer;
    const auth = await loginPortalCustomer(creds);
    accessToken = auth.accessToken;
    addressId = creds.customer.addresses[0]._id.toString();

    const { variant } = await createTestProduct();
    variantId = variant._id.toString();
  });

  async function createBasicSubscription() {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(createRes.status).toBe(201);
    return createRes.body.data.subscription;
  }

  it("creates a subscription", async () => {
    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 2 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.subscription.subscriptionNumber).toMatch(/^SUB-/);
    expect(res.body.data.subscription.status).toBe("active");
    expect(res.body.data.subscription.items).toHaveLength(1);
  });

  it("rejects unauthenticated subscription requests", async () => {
    const res = await request(app).get("/api/portal/subscriptions");
    expect(res.status).toBe(401);
  });

  it("rejects create when no valid delivery day is provided", async () => {
    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(res.status).toBe(400);
  });

  it("rejects create with zero items", async () => {
    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [],
      });

    expect(res.status).toBe(400);
  });

  it("creates an every_two_weeks subscription", async () => {
    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "every_two_weeks",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.subscription.frequency).toBe("every_two_weeks");
  });

  it("persists optional notes on creation", async () => {
    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        notes: "Leave by the side gate",
        items: [{ variantId, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.subscription.notes).toBe("Leave by the side gate");
  });

  it("sets next delivery to next-week occurrence when selected day is today", async () => {
    const todayWeekday = new Date().getDay();

    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        deliveryDays: [0, 1, 2, 3, 4, 5, 6],
      },
      { upsert: true },
    );

    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: todayWeekday,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(res.status).toBe(201);

    const nextDelivery = new Date(res.body.data.subscription.nextDeliveryDate);
    const now = new Date();
    const diffDays = Math.round(
      (nextDelivery.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)) /
        (24 * 60 * 60 * 1000),
    );
    expect(diffDays).toBe(7);
  });

  it("rejects create when stripe customer cannot be retrieved", async () => {
    stripe.customers.retrieve.mockRejectedValueOnce(new Error("Stripe down"));

    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/could not verify your payment profile/i);
  });

  it("rejects create when no default card is configured", async () => {
    stripe.customers.retrieve.mockResolvedValueOnce({
      id: "cus_test_mock",
      deleted: false,
      invoice_settings: { default_payment_method: null },
    });

    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/default card/i);
  });

  it("rejects create with unknown delivery address id", async () => {
    const randomAddressId =
      new (require("mongoose").Types.ObjectId)().toString();

    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: randomAddressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/delivery address not found/i);
  });

  it("rejects create with inactive variant", async () => {
    const { variant } = await createTestProduct();
    await ProductVariant.findByIdAndUpdate(variant._id, { status: "inactive" });

    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId: variant._id.toString(), quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/products are unavailable|not available/i);
  });

  it("rejects create with non-subscription-eligible product", async () => {
    const { product, variant } = await createTestProduct();
    await Product.findByIdAndUpdate(product._id, {
      isSubscriptionEligible: false,
    });

    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId: variant._id.toString(), quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not eligible for subscriptions/i);
  });

  it("rejects create when first invoice charge fails", async () => {
    stripe.subscriptions.create.mockRejectedValueOnce(
      new Error("Your card was declined"),
    );

    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(
      /declined|couldn't create your subscription/i,
    );
  });

  it("uses Stripe test clock frozen time for creation date math", async () => {
    const frozenSeconds = 1893456000; // 2030-01-01T00:00:00.000Z

    stripe.customers.retrieve.mockResolvedValue({
      id: "cus_test_clock",
      deleted: false,
      test_clock: "clock_test_1",
      invoice_settings: { default_payment_method: "pm_test_default" },
    });
    stripe.testHelpers.testClocks.retrieve.mockResolvedValue({
      id: "clock_test_1",
      frozen_time: frozenSeconds,
    });

    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    const stored = await Subscription.findById(
      res.body.data.subscription._id,
    ).lean();
    expect(new Date(stored.startDate).toISOString()).toBe(
      new Date(frozenSeconds * 1000).toISOString(),
    );
    expect(stripe.testHelpers.testClocks.retrieve).toHaveBeenCalledWith(
      "clock_test_1",
    );
  });

  it("creates a weekly multi-day subscription and schedules only selected weekdays", async () => {
    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        preferredDeliveryDays: [0, 3],
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    const subscription = res.body.data.subscription;
    expect(subscription.preferredDeliveryDay).toBe(0);
    expect(subscription.preferredDeliveryDays).toEqual([0, 3]);

    const deliveriesRes = await request(app)
      .get(`/api/portal/subscriptions/${subscription._id}/deliveries`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deliveriesRes.status).toBe(200);
    const deliveries = deliveriesRes.body.data.deliveries;
    expect(Array.isArray(deliveries)).toBe(true);
    expect(deliveries.length).toBeGreaterThanOrEqual(3);

    const weekdays = deliveries
      .slice(0, 3)
      .map((d) => new Date(d.scheduledDate).getDay());
    expect(weekdays.every((day) => [0, 3].includes(day))).toBe(true);
    expect(new Set(weekdays).size).toBeGreaterThan(1);
  });

  it("can pause, resume, and cancel subscription", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 3,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(createRes.status).toBe(201);
    const subId = createRes.body.data.subscription._id;

    // Pause
    const pauseRes = await request(app)
      .post(`/api/portal/subscriptions/${subId}/pause`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ resumeOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
    expect(pauseRes.status).toBe(200);

    // Resume
    const resumeRes = await request(app)
      .post(`/api/portal/subscriptions/${subId}/resume`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(resumeRes.status).toBe(200);

    // Move next delivery near enough so the cut-off is already in the past,
    // then cancellation should succeed without requiring an immediate refund.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await Subscription.findByIdAndUpdate(subId, { nextDeliveryDate: tomorrow });
    await SubscriptionDelivery.create({
      subscription: subId,
      customer: customer._id,
      scheduledDate: tomorrow,
      status: "scheduled",
    });

    // Cancel
    const cancelRes = await request(app)
      .post(`/api/portal/subscriptions/${subId}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "No longer needed" });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.subscription.status).toBe("active");
    expect(cancelRes.body.data.subscription.isCancellationScheduled).toBe(true);
    expect(cancelRes.body.data.refundedMinor).toBe(0);
  });

  it("stages multi-day update after cut-off and keeps current live days unchanged", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        preferredDeliveryDays: [0, 3],
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(createRes.status).toBe(201);
    const subId = createRes.body.data.subscription._id;

    // Force an already-past cut-off by bringing next delivery to tomorrow.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await Subscription.findByIdAndUpdate(subId, { nextDeliveryDate: tomorrow });

    const updateRes = await request(app)
      .patch(`/api/portal/subscriptions/${subId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        preferredDeliveryDay: 3,
        preferredDeliveryDays: [3, 0],
      });

    expect(updateRes.status).toBe(200);

    const stored = await Subscription.findById(subId).lean();
    expect(stored.preferredDeliveryDays).toEqual([0, 3]);
    expect(stored.pendingChanges).toBeTruthy();
    expect(stored.pendingChanges.preferredDeliveryDay).toBe(0);
    expect(stored.pendingChanges.preferredDeliveryDays).toEqual([0, 3]);

    const scheduled = await SubscriptionDelivery.find({ subscription: subId })
      .sort({ scheduledDate: 1 })
      .lean();
    expect(scheduled.length).toBeGreaterThan(0);
  });

  it("cannot access another customer's subscription", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });
    const subId = createRes.body.data.subscription._id;

    // Log in as a different customer
    const other = await createPortalCustomer();
    const otherAuth = await loginPortalCustomer(other);

    const res = await request(app)
      .get(`/api/portal/subscriptions/${subId}`)
      .set("Authorization", `Bearer ${otherAuth.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("rejects create with unavailable delivery day", async () => {
    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 2,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(
      /selected delivery days are not available/i,
    );
  });

  it("rejects create when customer has no stripeCustomerId", async () => {
    await Customer.findByIdAndUpdate(customer._id, { stripeCustomerId: null });

    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(
      /payment method before creating a subscription/i,
    );
  });

  it("rejects item add while subscription is paused", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });
    const subId = createRes.body.data.subscription._id;

    const pauseRes = await request(app)
      .post(`/api/portal/subscriptions/${subId}/pause`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ resumeOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
    expect(pauseRes.status).toBe(200);

    const addRes = await request(app)
      .post(`/api/portal/subscriptions/${subId}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ variantId, quantity: 1 });

    expect(addRes.status).toBe(400);
    expect(addRes.body.message).toMatch(
      /paused or cancelled subscriptions cannot be changed/i,
    );
  });

  it("rejects removing the last remaining item", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });
    expect(createRes.status).toBe(201);
    const sub = createRes.body.data.subscription;
    const itemId = sub.items[0]._id;

    const removeRes = await request(app)
      .delete(`/api/portal/subscriptions/${sub._id}/items/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(removeRes.status).toBe(400);
    expect(removeRes.body.message).toMatch(/cannot remove the last item/i);
  });

  it("rejects updates while paused", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });
    const subId = createRes.body.data.subscription._id;

    const pauseRes = await request(app)
      .post(`/api/portal/subscriptions/${subId}/pause`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ resumeOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
    expect(pauseRes.status).toBe(200);

    const updateRes = await request(app)
      .patch(`/api/portal/subscriptions/${subId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ notes: "attempt update while paused" });

    expect(updateRes.status).toBe(400);
    expect(updateRes.body.message).toMatch(
      /paused or cancelled subscriptions cannot be changed/i,
    );
  });

  it("rejects pause without resume date", async () => {
    const sub = await createBasicSubscription();

    const res = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/pause`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(
      /choose when the subscription should resume/i,
    );
  });

  it("rejects pause with invalid resume date", async () => {
    const sub = await createBasicSubscription();

    const res = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/pause`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ resumeOn: "not-a-date" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/choose a valid resume date/i);
  });

  it("rejects pause with resume date today or in the past", async () => {
    const sub = await createBasicSubscription();

    const today = new Date();
    today.setHours(9, 0, 0, 0);
    const res = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/pause`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ resumeOn: today });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least tomorrow/i);
  });

  it("rejects pause longer than 28 days", async () => {
    const sub = await createBasicSubscription();

    const beyondLimit = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000);
    const res = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/pause`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ resumeOn: beyondLimit });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/up to 28 days/i);
  });

  it("rejects pause on already paused subscription", async () => {
    const sub = await createBasicSubscription();

    const pauseDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const firstPause = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/pause`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ resumeOn: pauseDate });
    expect(firstPause.status).toBe(200);

    const secondPause = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/pause`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ resumeOn: pauseDate });

    expect(secondPause.status).toBe(400);
    expect(secondPause.body.message).toMatch(
      /only active subscriptions can be paused/i,
    );
  });

  it("rejects resume on active and cancelled subscriptions", async () => {
    const sub = await createBasicSubscription();

    const resumeActive = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/resume`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(resumeActive.status).toBe(400);
    expect(resumeActive.body.message).toMatch(
      /only paused subscriptions can be resumed/i,
    );

    await Subscription.findByIdAndUpdate(sub._id, { status: "cancelled" });
    const resumeCancelled = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/resume`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(resumeCancelled.status).toBe(400);
    expect(resumeCancelled.body.message).toMatch(
      /only paused subscriptions can be resumed/i,
    );
  });

  it("rejects pause and cancel on cancelled subscription", async () => {
    const sub = await createBasicSubscription();
    await Subscription.findByIdAndUpdate(sub._id, { status: "cancelled" });

    const pauseRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/pause`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ resumeOn: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) });
    expect(pauseRes.status).toBe(400);
    expect(pauseRes.body.message).toMatch(
      /only active subscriptions can be paused/i,
    );

    const cancelRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "already cancelled" });
    expect(cancelRes.status).toBe(400);
    expect(cancelRes.body.message).toMatch(/already cancelled/i);
  });

  it("stores cancel reason when cancellation succeeds", async () => {
    const sub = await createBasicSubscription();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: tomorrow,
    });

    const res = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "Going on holiday" });

    expect(res.status).toBe(200);
    expect(res.body.data.subscription.cancelReason).toBe("Going on holiday");
  });

  it("rejects update to unavailable delivery day", async () => {
    const sub = await createBasicSubscription();

    const res = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ preferredDeliveryDay: 2 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(
      /selected delivery days are not available/i,
    );
  });

  it("validates subscription id and item id route params", async () => {
    const invalidSubRes = await request(app)
      .get("/api/portal/subscriptions/not-a-valid-id")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(invalidSubRes.status).toBe(400);

    const sub = await createBasicSubscription();
    const invalidItemRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}/items/not-a-valid-item-id`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ quantity: 2 });
    expect(invalidItemRes.status).toBe(400);
  });

  it("validates body schema for create and item add", async () => {
    const unknownFieldRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
        extraField: "not-allowed",
      });
    expect(unknownFieldRes.status).toBe(400);

    const invalidFrequencyRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "daily",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });
    expect(invalidFrequencyRes.status).toBe(400);

    const badDaysRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDays: [0, 0],
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });
    expect(badDaysRes.status).toBe(400);

    const sub = await createBasicSubscription();
    const addBadQtyRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ variantId, quantity: 0 });
    expect(addBadQtyRes.status).toBe(400);
  });

  it("decrease before cut-off with store credit adds customer credit", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 3 }],
      });
    expect(createRes.status).toBe(201);
    const sub = createRes.body.data.subscription;
    const itemId = sub.items[0]._id;

    const subtotal = sub.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    await Order.create({
      customer: customer._id,
      items: sub.items.map((item) => ({
        product: item.product,
        variant: item.variant,
        name: item.name,
        sku: item.sku,
        price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
      })),
      deliveryAddress: {
        line1: "1 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
      },
      customerInstructions: "",
      location: { lat: 51.5, lng: -0.1 },
      deliveryDate: new Date(sub.nextDeliveryDate),
      deliveryFee: 0,
      subtotal,
      total: subtotal,
      amountPaid: subtotal,
      status: "paid",
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      orderType: "subscription_generated",
      subscription: sub._id,
      stripePaymentIntentId: `pi_paid_${crypto.randomUUID().slice(0, 8)}`,
      paidAt: new Date(),
    });

    const updateRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}/items/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ quantity: 1, refundMethod: "credit" });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.message).toMatch(/store credit/i);
    expect(updateRes.body.data.creditedMinor).toBe(500);

    const refreshedCustomer = await Customer.findById(customer._id).lean();
    expect(refreshedCustomer.creditBalance).toBe(500);

    const creditTx = await StoreCreditTransaction.findOne({
      customer: customer._id,
      type: "subscription_refund",
    }).lean();
    expect(creditTx).toBeTruthy();
    expect(creditTx.amount).toBe(500);
  });

  it("add item before cut-off charges immediately", async () => {
    const sub = await createBasicSubscription();
    const { variant: secondVariant } = await createTestProduct();

    const addRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ variantId: secondVariant._id.toString(), quantity: 2 });

    expect(addRes.status).toBe(200);
    expect(addRes.body.data.chargedMinor).toBe(500);
    expect(stripe.paymentIntents.create).toHaveBeenCalled();
  });

  it("rejects add item before cut-off when immediate charge fails", async () => {
    const sub = await createBasicSubscription();
    const { variant: secondVariant } = await createTestProduct();
    stripe.paymentIntents.create.mockRejectedValueOnce(
      new Error("card declined"),
    );

    const addRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ variantId: secondVariant._id.toString(), quantity: 2 });

    expect(addRes.status).toBe(400);
    expect(addRes.body.message).toMatch(/declined|charge your card/i);
  });

  it("rejects pre-cutoff increase when customer has no default card", async () => {
    const sub = await createBasicSubscription();
    const { variant: secondVariant } = await createTestProduct();

    stripe.customers.retrieve.mockResolvedValueOnce({
      id: "cus_test_mock",
      deleted: false,
      invoice_settings: { default_payment_method: null },
    });

    const addRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ variantId: secondVariant._id.toString(), quantity: 1 });

    expect(addRes.status).toBe(400);
    expect(addRes.body.message).toMatch(/default card/i);
  });

  it("archives old Stripe price when syncing after item change", async () => {
    const sub = await createBasicSubscription();
    const oldPriceId = sub.stripePriceId;
    const { variant: secondVariant } = await createTestProduct();
    const priorUpdateCalls = stripe.prices.update.mock.calls.length;

    const addRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ variantId: secondVariant._id.toString(), quantity: 1 });

    expect(addRes.status).toBe(200);
    const newCalls = stripe.prices.update.mock.calls.slice(priorUpdateCalls);
    expect(
      newCalls.some(
        (args) => args[0] === oldPriceId && args[1]?.active === false,
      ),
    ).toBe(true);
  });

  it("keeps DB update successful when Stripe price sync throws", async () => {
    const sub = await createBasicSubscription();
    const itemId = sub.items[0]._id;

    stripe.prices.create.mockRejectedValueOnce(
      new Error("price create failed"),
    );

    const res = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}/items/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ quantity: 2 });

    expect(res.status).toBe(200);
    const stored = await Subscription.findById(sub._id).lean();
    expect(stored.items[0].quantity).toBe(2);
  });

  it("adds same variant by increasing quantity without duplicate line", async () => {
    const sub = await createBasicSubscription();
    const addRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ variantId, quantity: 2 });

    expect(addRes.status).toBe(200);
    const stored = await Subscription.findById(sub._id).lean();
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0].quantity).toBe(3);
  });

  it("adds item after cut-off as staged pending change", async () => {
    const sub = await createBasicSubscription();
    const { variant: secondVariant } = await createTestProduct();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: tomorrow,
    });

    const addRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ variantId: secondVariant._id.toString(), quantity: 1 });

    expect(addRes.status).toBe(200);
    expect(addRes.body.data.appliedTo).toBe("next");

    const stored = await Subscription.findById(sub._id).lean();
    expect(stored.pendingChanges).toBeTruthy();
  });

  it("stages after cut-off from one frequency cycle past the upcoming delivery (every 2 weeks)", async () => {
    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        deliveryDays: [0, 3],
        cutoffDaysBefore: 2,
        cutoffTime: "22:00",
      },
      { upsert: true },
    );

    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "every_two_weeks",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });
    expect(createRes.status).toBe(201);
    const sub = createRes.body.data.subscription;
    const { variant: secondVariant } = await createTestProduct();

    // Upcoming delivery is tomorrow (cut-off already passed). The internal
    // billing anchor sits a full two-week cycle later, which must NOT be used
    // as the staging anchor.
    const upcoming = new Date();
    upcoming.setDate(upcoming.getDate() + 1);
    upcoming.setHours(9, 0, 0, 0);

    const billingAnchor = new Date(upcoming);
    billingAnchor.setDate(billingAnchor.getDate() + 14);

    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: billingAnchor,
    });
    await SubscriptionDelivery.create({
      subscription: sub._id,
      customer: customer._id,
      scheduledDate: upcoming,
      status: "scheduled",
    });

    const addRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ variantId: secondVariant._id.toString(), quantity: 1 });

    expect(addRes.status).toBe(200);
    expect(addRes.body.data.appliedTo).toBe("next");

    const stored = await Subscription.findById(sub._id).lean();
    expect(stored.pendingChanges).toBeTruthy();

    const expectedEffectiveFrom = new Date(upcoming);
    expectedEffectiveFrom.setDate(expectedEffectiveFrom.getDate() + 14);

    expect(new Date(stored.pendingChanges.effectiveFrom).toDateString()).toBe(
      expectedEffectiveFrom.toDateString(),
    );
  });

  it("rejects add item when variant is unavailable or product not eligible", async () => {
    const sub = await createBasicSubscription();
    const { product, variant: secondVariant } = await createTestProduct();

    await ProductVariant.findByIdAndUpdate(secondVariant._id, {
      status: "inactive",
    });
    const inactiveRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ variantId: secondVariant._id.toString(), quantity: 1 });
    expect(inactiveRes.status).toBe(400);

    await ProductVariant.findByIdAndUpdate(secondVariant._id, {
      status: "active",
    });
    await Product.findByIdAndUpdate(product._id, {
      isSubscriptionEligible: false,
    });
    const ineligibleRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ variantId: secondVariant._id.toString(), quantity: 1 });
    expect(ineligibleRes.status).toBe(400);
  });

  it("rejects add item when subscription is cancelled", async () => {
    const sub = await createBasicSubscription();
    await Subscription.findByIdAndUpdate(sub._id, { status: "cancelled" });

    const addRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ variantId, quantity: 1 });

    expect(addRes.status).toBe(400);
    expect(addRes.body.message).toMatch(/paused or cancelled/i);
  });

  it("increases quantity before cut-off with immediate charge", async () => {
    const sub = await createBasicSubscription();
    const itemId = sub.items[0]._id;

    const res = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}/items/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ quantity: 3 });

    expect(res.status).toBe(200);
    expect(res.body.data.chargedMinor).toBe(500);
  });

  it("updates quantity after cut-off as staged change", async () => {
    const sub = await createBasicSubscription();
    const itemId = sub.items[0]._id;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: tomorrow,
    });

    const res = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}/items/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ quantity: 3 });

    expect(res.status).toBe(200);
    expect(res.body.data.appliedTo).toBe("next");
    const stored = await Subscription.findById(sub._id).lean();
    expect(stored.pendingChanges).toBeTruthy();
  });

  it("builds subsequent after-cutoff quantity updates on the staged pending baseline", async () => {
    const sub = await createBasicSubscription();
    const itemId = sub.items[0]._id;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: tomorrow,
    });

    const firstRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}/items/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ quantity: 2 });

    expect(firstRes.status).toBe(200);
    expect(firstRes.body.data.appliedTo).toBe("next");

    stripe.prices.create.mockClear();

    const secondRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}/items/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ quantity: 3 });

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.data.appliedTo).toBe("next");

    const stored = await Subscription.findById(sub._id).lean();
    expect(stored.pendingChanges).toBeTruthy();
    expect(stored.pendingChanges.items[0].quantity).toBe(3);
    expect(stripe.prices.create).toHaveBeenCalled();
    expect(stripe.prices.create.mock.calls.at(-1)?.[0]?.unit_amount).toBe(750);
  });

  it("rejects update for non-existent subscription item", async () => {
    const sub = await createBasicSubscription();
    const badItemId = new (require("mongoose").Types.ObjectId)().toString();

    const res = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}/items/${badItemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ quantity: 2 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/item not found/i);
  });

  it("removes item after cut-off as staged change and rejects remove while paused", async () => {
    const { variant: secondVariant } = await createTestProduct();
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [
          { variantId, quantity: 1 },
          { variantId: secondVariant._id.toString(), quantity: 1 },
        ],
      });
    expect(createRes.status).toBe(201);
    const sub = createRes.body.data.subscription;
    const itemId = sub.items[0]._id;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: tomorrow,
    });

    const stagedRemove = await request(app)
      .delete(`/api/portal/subscriptions/${sub._id}/items/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refundMethod: "credit" });
    expect(stagedRemove.status).toBe(200);
    expect(stagedRemove.body.data.appliedTo).toBe("next");

    await Subscription.findByIdAndUpdate(sub._id, { status: "paused" });
    const pausedRemove = await request(app)
      .delete(`/api/portal/subscriptions/${sub._id}/items/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(pausedRemove.status).toBe(400);
  });

  it("pause keeps upcoming scheduled delivery and cancels later slots", async () => {
    const sub = await createBasicSubscription();
    const nextDelivery = new Date(sub.nextDeliveryDate);
    const later = new Date(nextDelivery);
    later.setDate(later.getDate() + 7);

    await SubscriptionDelivery.create({
      subscription: sub._id,
      customer: customer._id,
      scheduledDate: later,
      status: "scheduled",
    });

    const pauseRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/pause`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ resumeOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
    expect(pauseRes.status).toBe(200);

    const deliveries = await SubscriptionDelivery.find({
      subscription: sub._id,
    }).lean();
    const upcoming = deliveries.find(
      (d) => new Date(d.scheduledDate).getTime() === nextDelivery.getTime(),
    );
    expect(upcoming?.status).toBe("scheduled");
    expect(
      deliveries.some(
        (d) =>
          new Date(d.scheduledDate) > nextDelivery && d.status === "cancelled",
      ),
    ).toBe(true);
  });

  it("pause succeeds even if Stripe pause call fails", async () => {
    const sub = await createBasicSubscription();
    stripe.subscriptions.update.mockRejectedValueOnce(
      new Error("stripe pause failure"),
    );

    const pauseRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/pause`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ resumeOn: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) });

    expect(pauseRes.status).toBe(200);
    const stored = await Subscription.findById(sub._id).lean();
    expect(stored.status).toBe("paused");
  });

  it("auto-resume resumes only due paused subscriptions", async () => {
    const due = await createBasicSubscription();
    const future = await createBasicSubscription();

    await Subscription.findByIdAndUpdate(due._id, {
      status: "paused",
      pausedUntil: new Date(Date.now() - 60 * 1000),
      pausedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
    await Subscription.findByIdAndUpdate(future._id, {
      status: "paused",
      pausedUntil: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      pausedAt: new Date(),
    });

    const notifSpy = jest
      .spyOn(CustomerNotification, "create")
      .mockResolvedValue({ _id: new (require("mongoose").Types.ObjectId)() });

    const resumed = await subscriptionService.AutoResumePausedSubscriptions();
    expect(resumed).toBeGreaterThanOrEqual(1);

    const dueStored = await Subscription.findById(due._id).lean();
    const futureStored = await Subscription.findById(future._id).lean();
    expect(dueStored.status).toBe("active");
    expect(futureStored.status).toBe("paused");

    notifSpy.mockRestore();
  });

  it("cancel before cut-off handles refund success and failure branches", async () => {
    const sub = await createBasicSubscription();
    const nextDelivery = new Date();
    nextDelivery.setDate(nextDelivery.getDate() + 5);
    nextDelivery.setHours(9, 0, 0, 0);
    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: nextDelivery,
    });

    const subtotal = sub.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    const mkOrder = async ({
      targetSub,
      amountPaid = subtotal,
      withPI = true,
    } = {}) =>
      Order.create({
        customer: customer._id,
        items: targetSub.items.map((item) => ({
          product: item.product,
          variant: item.variant,
          name: item.name,
          sku: item.sku,
          price: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.unitPrice * item.quantity,
        })),
        deliveryAddress: {
          line1: "1 Test Street",
          city: "London",
          postcode: "SW1A 1AA",
          country: "United Kingdom",
        },
        customerInstructions: "",
        location: { lat: 51.5, lng: -0.1 },
        deliveryDate: nextDelivery,
        deliveryFee: 0,
        subtotal,
        total: subtotal,
        amountPaid,
        status: "paid",
        deliveryStatus: "ordered",
        reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        orderType: "subscription_generated",
        subscription: targetSub._id,
        stripePaymentIntentId: withPI
          ? `pi_paid_${crypto.randomUUID().slice(0, 8)}`
          : null,
        paidAt: new Date(),
      });

    // success
    const paidOrder = await mkOrder({
      targetSub: sub,
      amountPaid: subtotal,
      withPI: true,
    });
    const cancelOk = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "test cancel" });
    expect(cancelOk.status).toBe(200);
    expect(cancelOk.body.data.refundedMinor).toBeGreaterThan(0);
    const refundedOrder = await Order.findById(paidOrder._id).lean();
    expect(refundedOrder.status).toBe("refunded");

    // no refundable order
    const sub2 = await createBasicSubscription();
    await Subscription.findByIdAndUpdate(sub2._id, {
      nextDeliveryDate: nextDelivery,
    });
    const cancelNoOrder = await request(app)
      .post(`/api/portal/subscriptions/${sub2._id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "test cancel" });
    expect(cancelNoOrder.status).toBe(400);

    // zero refundable amount
    const sub3 = await createBasicSubscription();
    await Subscription.findByIdAndUpdate(sub3._id, {
      nextDeliveryDate: nextDelivery,
    });
    await mkOrder({ targetSub: sub3, amountPaid: 0, withPI: true });
    const cancelZero = await request(app)
      .post(`/api/portal/subscriptions/${sub3._id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "test cancel" });
    expect(cancelZero.status).toBe(400);

    // refund failure
    const sub4 = await createBasicSubscription();
    await Subscription.findByIdAndUpdate(sub4._id, {
      nextDeliveryDate: nextDelivery,
    });
    await Order.create({
      customer: customer._id,
      items: sub4.items.map((item) => ({
        product: item.product,
        variant: item.variant,
        name: item.name,
        sku: item.sku,
        price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
      })),
      deliveryAddress: {
        line1: "1",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
      },
      customerInstructions: "",
      location: { lat: 0, lng: 0 },
      deliveryDate: nextDelivery,
      deliveryFee: 0,
      subtotal: 2.5,
      total: 2.5,
      amountPaid: 2.5,
      status: "paid",
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      orderType: "subscription_generated",
      subscription: sub4._id,
      stripePaymentIntentId: `pi_paid_${crypto.randomUUID().slice(0, 8)}`,
      paidAt: new Date(),
    });
    stripe.refunds.create.mockRejectedValueOnce(new Error("refund failed"));
    const cancelFail = await request(app)
      .post(`/api/portal/subscriptions/${sub4._id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "test cancel" });
    expect(cancelFail.status).toBe(400);
  });

  it("cancel before cut-off supports settling to store credit", async () => {
    const sub = await createBasicSubscription();
    const nextDelivery = new Date();
    nextDelivery.setDate(nextDelivery.getDate() + 5);
    nextDelivery.setHours(9, 0, 0, 0);
    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: nextDelivery,
    });

    const subtotal = sub.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    const paidOrder = await Order.create({
      customer: customer._id,
      items: sub.items.map((item) => ({
        product: item.product,
        variant: item.variant,
        name: item.name,
        sku: item.sku,
        price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
      })),
      deliveryAddress: {
        line1: "1 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
      },
      customerInstructions: "",
      location: { lat: 51.5, lng: -0.1 },
      deliveryDate: nextDelivery,
      deliveryFee: 0,
      subtotal,
      total: subtotal,
      amountPaid: subtotal,
      status: "paid",
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      orderType: "subscription_generated",
      subscription: sub._id,
      stripePaymentIntentId: null,
      paidAt: new Date(),
    });

    const cancelRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "prefer store credit", refundMethod: "credit" });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.refundedMinor).toBe(0);
    expect(cancelRes.body.data.creditedMinor).toBe(
      Math.round(Number(subtotal || 0) * 100),
    );
    expect(cancelRes.body.message).toMatch(/store credit/i);

    const refreshedCustomer = await Customer.findById(customer._id).lean();
    expect(refreshedCustomer.creditBalance).toBe(
      Math.round(Number(subtotal || 0) * 100),
    );

    const creditTx = await StoreCreditTransaction.findOne({
      customer: customer._id,
      type: "subscription_refund",
      order: paidOrder._id,
    }).lean();
    expect(creditTx).toBeTruthy();

    const refreshedOrder = await Order.findById(paidOrder._id).lean();
    expect(refreshedOrder.status).toBe("refunded");
  });

  it("cancel before cutoff updates generated delivery order status to refunded", async () => {
    const sub = await createBasicSubscription();

    const nextDelivery = new Date();
    nextDelivery.setDate(nextDelivery.getDate() + 2);
    nextDelivery.setHours(9, 0, 0, 0);

    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: nextDelivery,
    });

    const subtotal = sub.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    const paidOrder = await Order.create({
      customer: customer._id,
      items: sub.items.map((item) => ({
        product: item.product,
        variant: item.variant,
        name: item.name,
        sku: item.sku,
        price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
      })),
      deliveryAddress: {
        line1: "1 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
      },
      customerInstructions: "",
      location: { lat: 51.5, lng: -0.1 },
      deliveryDate: nextDelivery,
      deliveryFee: 0,
      subtotal,
      total: subtotal,
      amountPaid: subtotal,
      status: "paid",
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      orderType: "subscription_generated",
      subscription: sub._id,
      stripePaymentIntentId: `pi_paid_${crypto.randomUUID().slice(0, 8)}`,
      paidAt: new Date(),
    });

    await SubscriptionDelivery.create({
      subscription: sub._id,
      customer: customer._id,
      order: paidOrder._id,
      scheduledDate: nextDelivery,
      status: "generated",
      generatedAt: new Date(),
    });

    const cancelRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "generated slot refund" });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.refundedMinor).toBeGreaterThan(0);

    const refreshedOrder = await Order.findById(paidOrder._id).lean();
    expect(refreshedOrder.status).toBe("refunded");

    const refreshedDelivery = await SubscriptionDelivery.findOne({
      subscription: sub._id,
      order: paidOrder._id,
    }).lean();
    expect(refreshedDelivery.status).toBe("cancelled");
  });

  it("multi-day cancel before cutoff for both orders refunds both and cancels immediately", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        preferredDeliveryDays: [0, 3],
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });
    expect(createRes.status).toBe(201);
    const sub = createRes.body.data.subscription;

    const now = new Date();
    const firstDelivery = new Date(now);
    firstDelivery.setDate(firstDelivery.getDate() + 1);
    firstDelivery.setHours(9, 0, 0, 0);
    const secondDelivery = new Date(firstDelivery);
    secondDelivery.setDate(secondDelivery.getDate() + 1);
    const futureCutoffTime = `${String((now.getHours() + 1) % 24).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        deliveryDays: [0, 1, 2, 3, 4, 5, 6],
        cutoffDaysBefore: 0,
        cutoffTime: futureCutoffTime,
      },
      { upsert: true },
    );

    await SubscriptionDelivery.create([
      {
        subscription: sub._id,
        customer: customer._id,
        scheduledDate: firstDelivery,
        status: "scheduled",
      },
      {
        subscription: sub._id,
        customer: customer._id,
        scheduledDate: secondDelivery,
        status: "scheduled",
      },
    ]);

    const subtotal = sub.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    const [firstOrder, secondOrder] = await Order.create([
      {
        customer: customer._id,
        items: sub.items.map((item) => ({
          product: item.product,
          variant: item.variant,
          name: item.name,
          sku: item.sku,
          price: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.unitPrice * item.quantity,
        })),
        deliveryAddress: {
          line1: "1 Test Street",
          city: "London",
          postcode: "SW1A 1AA",
          country: "United Kingdom",
        },
        customerInstructions: "",
        location: { lat: 51.5, lng: -0.1 },
        deliveryDate: firstDelivery,
        deliveryFee: 0,
        subtotal,
        total: subtotal,
        amountPaid: subtotal,
        status: "paid",
        deliveryStatus: "ordered",
        reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        orderType: "subscription_generated",
        subscription: sub._id,
        stripePaymentIntentId: `pi_paid_${crypto.randomUUID().slice(0, 8)}`,
        paidAt: new Date(),
      },
      {
        customer: customer._id,
        items: sub.items.map((item) => ({
          product: item.product,
          variant: item.variant,
          name: item.name,
          sku: item.sku,
          price: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.unitPrice * item.quantity,
        })),
        deliveryAddress: {
          line1: "1 Test Street",
          city: "London",
          postcode: "SW1A 1AA",
          country: "United Kingdom",
        },
        customerInstructions: "",
        location: { lat: 51.5, lng: -0.1 },
        deliveryDate: secondDelivery,
        deliveryFee: 0,
        subtotal,
        total: subtotal,
        amountPaid: subtotal,
        status: "paid",
        deliveryStatus: "ordered",
        reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        orderType: "subscription_generated",
        subscription: sub._id,
        stripePaymentIntentId: `pi_paid_${crypto.randomUUID().slice(0, 8)}`,
        paidAt: new Date(),
      },
    ]);

    const cancelRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "multi-day before both" });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.refundedMinor).toBe(
      Math.round(Number(subtotal || 0) * 100) * 2,
    );
    expect(cancelRes.body.data.subscription.status).toBe("cancelled");
    expect(cancelRes.body.data.subscription.isCancellationScheduled).toBe(
      false,
    );

    const refreshedFirst = await Order.findById(firstOrder._id).lean();
    const refreshedSecond = await Order.findById(secondOrder._id).lean();
    expect(refreshedFirst.status).toBe("refunded");
    expect(refreshedSecond.status).toBe("refunded");

    const deliveries = await SubscriptionDelivery.find({
      subscription: sub._id,
    }).lean();
    expect(
      deliveries.every((delivery) => delivery.status === "cancelled"),
    ).toBe(true);
  });

  it("multi-day cancel before cutoff for one order refunds only that order", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        preferredDeliveryDays: [0, 3],
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });
    expect(createRes.status).toBe(201);
    const sub = createRes.body.data.subscription;

    const now = new Date();
    const firstDelivery = new Date(now);
    firstDelivery.setHours(now.getHours() + 2, 0, 0, 0);
    const secondDelivery = new Date(firstDelivery);
    secondDelivery.setDate(secondDelivery.getDate() + 1);
    const pastCutoffTime = `${String((now.getHours() + 23) % 24).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        deliveryDays: [0, 1, 2, 3, 4, 5, 6],
        cutoffDaysBefore: 0,
        cutoffTime: pastCutoffTime,
      },
      { upsert: true },
    );

    await SubscriptionDelivery.create([
      {
        subscription: sub._id,
        customer: customer._id,
        scheduledDate: firstDelivery,
        status: "scheduled",
      },
      {
        subscription: sub._id,
        customer: customer._id,
        scheduledDate: secondDelivery,
        status: "scheduled",
      },
    ]);

    const subtotal = sub.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    const [firstOrder, secondOrder] = await Order.create([
      {
        customer: customer._id,
        items: sub.items.map((item) => ({
          product: item.product,
          variant: item.variant,
          name: item.name,
          sku: item.sku,
          price: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.unitPrice * item.quantity,
        })),
        deliveryAddress: {
          line1: "1 Test Street",
          city: "London",
          postcode: "SW1A 1AA",
          country: "United Kingdom",
        },
        customerInstructions: "",
        location: { lat: 51.5, lng: -0.1 },
        deliveryDate: firstDelivery,
        deliveryFee: 0,
        subtotal,
        total: subtotal,
        amountPaid: subtotal,
        status: "paid",
        deliveryStatus: "ordered",
        reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        orderType: "subscription_generated",
        subscription: sub._id,
        stripePaymentIntentId: `pi_paid_${crypto.randomUUID().slice(0, 8)}`,
        paidAt: new Date(),
      },
      {
        customer: customer._id,
        items: sub.items.map((item) => ({
          product: item.product,
          variant: item.variant,
          name: item.name,
          sku: item.sku,
          price: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.unitPrice * item.quantity,
        })),
        deliveryAddress: {
          line1: "1 Test Street",
          city: "London",
          postcode: "SW1A 1AA",
          country: "United Kingdom",
        },
        customerInstructions: "",
        location: { lat: 51.5, lng: -0.1 },
        deliveryDate: secondDelivery,
        deliveryFee: 0,
        subtotal,
        total: subtotal,
        amountPaid: subtotal,
        status: "paid",
        deliveryStatus: "ordered",
        reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        orderType: "subscription_generated",
        subscription: sub._id,
        stripePaymentIntentId: `pi_paid_${crypto.randomUUID().slice(0, 8)}`,
        paidAt: new Date(),
      },
    ]);

    const cancelRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "multi-day one open" });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.refundedMinor).toBe(
      Math.round(Number(subtotal || 0) * 100),
    );
    expect(cancelRes.body.data.subscription.status).toBe("active");
    expect(cancelRes.body.data.subscription.isCancellationScheduled).toBe(true);

    const refreshedFirst = await Order.findById(firstOrder._id).lean();
    const refreshedSecond = await Order.findById(secondOrder._id).lean();
    expect(refreshedFirst.status).toBe("paid");
    expect(refreshedSecond.status).toBe("refunded");

    const deliveries = await SubscriptionDelivery.find({
      subscription: sub._id,
    })
      .sort({ scheduledDate: 1 })
      .lean();
    expect(deliveries[0].status).toBe("scheduled");
    expect(deliveries[1].status).toBe("cancelled");
  });

  it("multi-day cancel after cutoff for both orders gives no refund and schedules cancellation", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        preferredDeliveryDays: [0, 3],
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });
    expect(createRes.status).toBe(201);
    const sub = createRes.body.data.subscription;

    const now = new Date();
    const firstDelivery = new Date(now);
    firstDelivery.setHours(now.getHours() + 2, 0, 0, 0);
    const secondDelivery = new Date(firstDelivery);
    secondDelivery.setHours(now.getHours() + 4, 0, 0, 0);
    const pastCutoffTime = `${String((now.getHours() + 23) % 24).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        deliveryDays: [0, 1, 2, 3, 4, 5, 6],
        cutoffDaysBefore: 0,
        cutoffTime: pastCutoffTime,
      },
      { upsert: true },
    );

    await SubscriptionDelivery.create([
      {
        subscription: sub._id,
        customer: customer._id,
        scheduledDate: firstDelivery,
        status: "scheduled",
      },
      {
        subscription: sub._id,
        customer: customer._id,
        scheduledDate: secondDelivery,
        status: "scheduled",
      },
    ]);

    const subtotal = sub.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    const [firstOrder, secondOrder] = await Order.create([
      {
        customer: customer._id,
        items: sub.items.map((item) => ({
          product: item.product,
          variant: item.variant,
          name: item.name,
          sku: item.sku,
          price: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.unitPrice * item.quantity,
        })),
        deliveryAddress: {
          line1: "1 Test Street",
          city: "London",
          postcode: "SW1A 1AA",
          country: "United Kingdom",
        },
        customerInstructions: "",
        location: { lat: 51.5, lng: -0.1 },
        deliveryDate: firstDelivery,
        deliveryFee: 0,
        subtotal,
        total: subtotal,
        amountPaid: subtotal,
        status: "paid",
        deliveryStatus: "ordered",
        reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        orderType: "subscription_generated",
        subscription: sub._id,
        stripePaymentIntentId: `pi_paid_${crypto.randomUUID().slice(0, 8)}`,
        paidAt: new Date(),
      },
      {
        customer: customer._id,
        items: sub.items.map((item) => ({
          product: item.product,
          variant: item.variant,
          name: item.name,
          sku: item.sku,
          price: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.unitPrice * item.quantity,
        })),
        deliveryAddress: {
          line1: "1 Test Street",
          city: "London",
          postcode: "SW1A 1AA",
          country: "United Kingdom",
        },
        customerInstructions: "",
        location: { lat: 51.5, lng: -0.1 },
        deliveryDate: secondDelivery,
        deliveryFee: 0,
        subtotal,
        total: subtotal,
        amountPaid: subtotal,
        status: "paid",
        deliveryStatus: "ordered",
        reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        orderType: "subscription_generated",
        subscription: sub._id,
        stripePaymentIntentId: `pi_paid_${crypto.randomUUID().slice(0, 8)}`,
        paidAt: new Date(),
      },
    ]);

    const cancelRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "multi-day after both" });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.refundedMinor).toBe(0);
    expect(cancelRes.body.data.creditedMinor).toBe(0);
    expect(cancelRes.body.data.subscription.status).toBe("active");
    expect(cancelRes.body.data.subscription.isCancellationScheduled).toBe(true);

    const refreshedFirst = await Order.findById(firstOrder._id).lean();
    const refreshedSecond = await Order.findById(secondOrder._id).lean();
    expect(refreshedFirst.status).toBe("paid");
    expect(refreshedSecond.status).toBe("paid");

    const deliveries = await SubscriptionDelivery.find({
      subscription: sub._id,
    }).lean();
    const byDay = new Map(
      deliveries.map((delivery) => [
        new Date(delivery.scheduledDate).toISOString().slice(0, 10),
        delivery,
      ]),
    );
    expect(
      byDay.get(new Date(firstDelivery).toISOString().slice(0, 10))?.status,
    ).toBe("scheduled");
    expect(
      byDay.get(new Date(secondDelivery).toISOString().slice(0, 10))?.status,
    ).toBe("scheduled");
  });

  it("after cut-off for upcoming delivery does not refund even if nextDeliveryDate cutoff is still open", async () => {
    const sub = await createBasicSubscription();

    const upcomingDelivery = new Date();
    upcomingDelivery.setDate(upcomingDelivery.getDate() + 1);
    upcomingDelivery.setHours(9, 0, 0, 0);

    const laterBillingDate = new Date();
    laterBillingDate.setDate(laterBillingDate.getDate() + 7);
    laterBillingDate.setHours(9, 0, 0, 0);

    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: laterBillingDate,
    });

    await SubscriptionDelivery.create({
      subscription: sub._id,
      customer: customer._id,
      scheduledDate: upcomingDelivery,
      status: "scheduled",
    });

    const subtotal = sub.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    const paidOrder = await Order.create({
      customer: customer._id,
      items: sub.items.map((item) => ({
        product: item.product,
        variant: item.variant,
        name: item.name,
        sku: item.sku,
        price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
      })),
      deliveryAddress: {
        line1: "1 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
      },
      customerInstructions: "",
      location: { lat: 51.5, lng: -0.1 },
      deliveryDate: upcomingDelivery,
      deliveryFee: 0,
      subtotal,
      total: subtotal,
      amountPaid: subtotal,
      status: "paid",
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      orderType: "subscription_generated",
      subscription: sub._id,
      stripePaymentIntentId: `pi_paid_${crypto.randomUUID().slice(0, 8)}`,
      paidAt: new Date(),
    });

    stripe.refunds.create.mockClear();

    const cancelRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "after upcoming cutoff" });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.refundedMinor).toBe(0);
    expect(cancelRes.body.data.creditedMinor).toBe(0);
    expect(cancelRes.body.data.subscription.status).toBe("active");
    expect(cancelRes.body.data.subscription.isCancellationScheduled).toBe(true);
    expect(
      new Date(
        cancelRes.body.data.subscription.cancellationEffectiveAfter,
      ).toISOString(),
    ).toBe(upcomingDelivery.toISOString());
    expect(stripe.refunds.create).not.toHaveBeenCalled();

    const refreshedOrder = await Order.findById(paidOrder._id).lean();
    expect(refreshedOrder.status).toBe("paid");
  });

  it("cancel handles missing Stripe subscription gracefully", async () => {
    const sub = await createBasicSubscription();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: tomorrow,
    });

    stripe.subscriptions.cancel.mockRejectedValueOnce(
      new Error("No such subscription"),
    );
    const res = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "no such" });

    expect(res.status).toBe(200);
  });

  it("returns settings and supports subscription list filtering", async () => {
    const activeSub = await createBasicSubscription();
    const pausedSub = await createBasicSubscription();
    await Subscription.findByIdAndUpdate(activeSub._id, {
      preferredDeliveryDays: [0, 3],
      preferredDeliveryDay: 0,
    });
    await Subscription.findByIdAndUpdate(pausedSub._id, { status: "paused" });

    const settingsRes = await request(app)
      .get("/api/portal/subscriptions/settings")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body.data.settings).toBeTruthy();

    const listRes = await request(app)
      .get("/api/portal/subscriptions?status=active")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(listRes.status).toBe(200);
    expect(
      listRes.body.data.subscriptions.every((s) => s.status === "active"),
    ).toBe(true);
    expect(
      listRes.body.data.subscriptions.some((s) => s._id === activeSub._id),
    ).toBe(true);
    const listedActive = listRes.body.data.subscriptions.find(
      (s) => s._id === activeSub._id,
    );
    expect(listedActive.preferredDeliveryDaysLabel).toBe("Sunday, Wednesday");
  });

  it("includes the soonest scheduled delivery for display without changing nextDeliveryDate", async () => {
    const sub = await createBasicSubscription();

    const upcomingDelivery = new Date();
    upcomingDelivery.setDate(upcomingDelivery.getDate() + 1);
    upcomingDelivery.setHours(9, 0, 0, 0);

    const billingWindowStart = new Date();
    billingWindowStart.setDate(billingWindowStart.getDate() + 7);
    billingWindowStart.setHours(9, 0, 0, 0);

    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: billingWindowStart,
    });

    await SubscriptionDelivery.create({
      subscription: sub._id,
      customer: customer._id,
      scheduledDate: upcomingDelivery,
      status: "scheduled",
    });

    const listRes = await request(app)
      .get("/api/portal/subscriptions?status=active")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listRes.status).toBe(200);
    const listed = listRes.body.data.subscriptions.find(
      (subscription) => subscription._id === sub._id.toString(),
    );

    expect(listed).toBeTruthy();
    expect(new Date(listed.upcomingDeliveryDate).toISOString()).toBe(
      upcomingDelivery.toISOString(),
    );
    expect(new Date(listed.nextDeliveryDate).toISOString()).toBe(
      billingWindowStart.toISOString(),
    );
  });

  it("get subscription returns cutoff metadata", async () => {
    const sub = await createBasicSubscription();
    const res = await request(app)
      .get(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.cutoff).toBeTruthy();
    expect(typeof res.body.data.cutoff.isPastCutoff).toBe("boolean");
    expect(res.body.data.cutoff).toHaveProperty("cutoffDaysBefore");
  });

  it("get subscription cutoff metadata follows the upcoming scheduled delivery for display", async () => {
    const sub = await createBasicSubscription();

    const upcomingDelivery = new Date();
    upcomingDelivery.setDate(upcomingDelivery.getDate() + 1);
    upcomingDelivery.setHours(9, 0, 0, 0);

    const billingWindowStart = new Date();
    billingWindowStart.setDate(billingWindowStart.getDate() + 8);
    billingWindowStart.setHours(9, 0, 0, 0);

    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: billingWindowStart,
    });

    await SubscriptionDelivery.create({
      subscription: sub._id,
      customer: customer._id,
      scheduledDate: upcomingDelivery,
      status: "scheduled",
    });

    const res = await request(app)
      .get(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(
      new Date(res.body.data.subscription.upcomingDeliveryDate).toISOString(),
    ).toBe(upcomingDelivery.toISOString());

    const cutoffAt = new Date(res.body.data.cutoff.cutoffAt);
    const expectedCutoff = new Date(upcomingDelivery);
    expectedCutoff.setDate(
      expectedCutoff.getDate() - res.body.data.cutoff.cutoffDaysBefore,
    );

    const [hh, mm] = String(res.body.data.cutoff.cutoffTime || "00:00")
      .split(":")
      .map(Number);
    expectedCutoff.setHours(hh || 0, mm || 0, 0, 0);

    expect(cutoffAt.toISOString()).toBe(expectedCutoff.toISOString());
  });

  it("cutoff status without nextDeliveryDate is not past cutoff", async () => {
    const sub = await createBasicSubscription();
    await Subscription.findByIdAndUpdate(sub._id, { nextDeliveryDate: null });

    const res = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ variantId, quantity: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data.appliedTo).toBe("upcoming");
  });

  it("changing cutoffDaysBefore can flip update behavior to after-cutoff", async () => {
    const sub = await createBasicSubscription();

    const deliveryInThreeDays = new Date();
    deliveryInThreeDays.setDate(deliveryInThreeDays.getDate() + 3);
    deliveryInThreeDays.setHours(9, 0, 0, 0);
    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: deliveryInThreeDays,
    });

    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        cutoffDaysBefore: 0,
        cutoffTime: "22:00",
      },
      { upsert: true },
    );

    const beforeRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ notes: "before cutoff settings" });
    expect(beforeRes.status).toBe(200);

    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        cutoffDaysBefore: 5,
        cutoffTime: "22:00",
      },
      { upsert: true },
    );

    const afterRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ deliveryAddressId: addressId });

    expect(afterRes.status).toBe(200);
    const stored = await Subscription.findById(sub._id).lean();
    expect(stored.pendingChanges).toBeTruthy();
  });

  it("multi-day create rejects invalid deliveryDayPlans and supports defaults", async () => {
    const { variant: secondVariant } = await createTestProduct();

    const badUnselected = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDays: [0, 3],
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        deliveryDayPlans: [
          { day: 0, items: [{ variantId, quantity: 1 }] },
          {
            day: 2,
            items: [{ variantId: secondVariant._id.toString(), quantity: 1 }],
          },
        ],
      });
    expect(badUnselected.status).toBe(400);

    const badDuplicate = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDays: [0, 3],
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        deliveryDayPlans: [
          { day: 0, items: [{ variantId, quantity: 1 }] },
          {
            day: 0,
            items: [{ variantId: secondVariant._id.toString(), quantity: 1 }],
          },
        ],
      });
    expect(badDuplicate.status).toBe(400);

    const badEmptyPlan = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDays: [0, 3],
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        deliveryDayPlans: [
          { day: 0, items: [] },
          {
            day: 3,
            items: [{ variantId: secondVariant._id.toString(), quantity: 1 }],
          },
        ],
      });
    expect(badEmptyPlan.status).toBe(400);
    expect(badEmptyPlan.body.message).toMatch(
      /must contain at least 1 items|each selected day must have at least one product/i,
    );

    const missingPlan = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDays: [0, 3],
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        deliveryDayPlans: [{ day: 0, items: [{ variantId, quantity: 1 }] }],
      });
    expect(missingPlan.status).toBe(400);

    const defaultsOk = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDays: [0, 3],
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 2 }],
      });

    expect(defaultsOk.status).toBe(201);
    expect(
      Array.isArray(defaultsOk.body.data.subscription.deliveryDayPlans),
    ).toBe(true);
    expect(defaultsOk.body.data.subscription.deliveryDayPlans).toHaveLength(2);
  });

  it("multi-day update supports day plans before cutoff and rejects single-day day-plans", async () => {
    const mixedCutoffNow = new Date("2026-07-07T12:00:00.000Z");
    const nowSpy = jest
      .spyOn(Date, "now")
      .mockReturnValue(mixedCutoffNow.getTime());
    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        deliveryDays: [0, 3],
        cutoffDaysBefore: 1,
        cutoffTime: "10:00",
      },
      { upsert: true },
    );

    const { variant: secondVariant } = await createTestProduct();
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDays: [0, 3],
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });
    expect(createRes.status).toBe(201);
    const subId = createRes.body.data.subscription._id;

    const updateOk = await request(app)
      .patch(`/api/portal/subscriptions/${subId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        changedDeliveryDays: [0, 3],
        deliveryDayPlans: [
          { day: 0, items: [{ variantId, quantity: 2 }] },
          {
            day: 3,
            items: [{ variantId: secondVariant._id.toString(), quantity: 1 }],
          },
        ],
      });
    expect(updateOk.status).toBe(200);
    expect(updateOk.body.data.appliedTo).toBe("upcoming");
    expect(updateOk.body.data.chargedMinor).toBe(250);
    expect(stripe.paymentIntents.create).toHaveBeenCalled();

    const invalidSingleDay = await request(app)
      .patch(`/api/portal/subscriptions/${subId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        preferredDeliveryDays: [0],
        preferredDeliveryDay: 0,
        deliveryDayPlans: [{ day: 0, items: [{ variantId, quantity: 1 }] }],
      });
    expect(invalidSingleDay.status).toBe(400);
    nowSpy.mockRestore();
  });

  it("multi-day day-plan decrease before cutoff settles as refund/credit and does not charge", async () => {
    const mixedCutoffNow = new Date("2026-07-07T12:00:00.000Z");
    const nowSpy = jest
      .spyOn(Date, "now")
      .mockReturnValue(mixedCutoffNow.getTime());
    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        deliveryDays: [0, 3],
        cutoffDaysBefore: 1,
        cutoffTime: "10:00",
      },
      { upsert: true },
    );

    const { variant: secondVariant } = await createTestProduct();

    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDays: [0, 3],
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });
    expect(createRes.status).toBe(201);

    const sub = createRes.body.data.subscription;

    const increaseRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        changedDeliveryDays: [0, 3],
        deliveryDayPlans: [
          { day: 0, items: [{ variantId, quantity: 2 }] },
          {
            day: 3,
            items: [{ variantId: secondVariant._id.toString(), quantity: 1 }],
          },
        ],
      });

    expect(increaseRes.status).toBe(200);
    expect(increaseRes.body.data.appliedTo).toBe("upcoming");
    expect(increaseRes.body.data.chargedMinor).toBe(250);

    stripe.paymentIntents.create.mockClear();

    const updateRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        changedDeliveryDays: [0],
        deliveryDayPlans: [
          { day: 0, items: [{ variantId, quantity: 1 }] },
          {
            day: 3,
            items: [{ variantId: secondVariant._id.toString(), quantity: 1 }],
          },
        ],
      });

    expect(updateRes.status).toBe(200);
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(
      (updateRes.body.data.refundedMinor || 0) +
        (updateRes.body.data.creditedMinor || 0),
    ).toBe(250);
    nowSpy.mockRestore();
  });

  it("stages a changed locked delivery day in a multi-day plan without immediate charge and updates Stripe for the next invoice", async () => {
    const mixedCutoffNow = new Date("2026-07-07T12:00:00.000Z");
    const nowSpy = jest
      .spyOn(Date, "now")
      .mockReturnValue(mixedCutoffNow.getTime());
    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        deliveryDays: [0, 3],
        cutoffDaysBefore: 1,
        cutoffTime: "10:00",
      },
      { upsert: true },
    );

    const { variant: secondVariant } = await createTestProduct();

    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDays: [0, 3],
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });
    expect(createRes.status).toBe(201);
    const subId = createRes.body.data.subscription._id;

    stripe.paymentIntents.create.mockClear();
    stripe.prices.create.mockClear();

    const updateRes = await request(app)
      .patch(`/api/portal/subscriptions/${subId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        changedDeliveryDays: [3],
        deliveryDayPlans: [
          { day: 0, items: [{ variantId, quantity: 1 }] },
          {
            day: 3,
            items: [
              { variantId, quantity: 1 },
              { variantId: secondVariant._id.toString(), quantity: 1 },
            ],
          },
        ],
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.appliedTo).toBe("next");
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();

    const stored = await Subscription.findById(subId).lean();
    expect(stored.pendingChanges).toBeTruthy();
    expect(Array.isArray(stored.pendingChanges.deliveryDayPlans)).toBe(true);
    expect(
      stored.pendingChanges.deliveryDayPlans.find(
        (plan) => Number(plan.day) === 3,
      )?.items.length,
    ).toBe(2);

    expect(stripe.prices.create).toHaveBeenCalled();
    expect(stripe.prices.create.mock.calls.at(-1)?.[0]?.unit_amount).toBe(750);
    nowSpy.mockRestore();
  });

  it("charges only the open-day delta immediately when a staged locked-day plan already exists", async () => {
    const mixedCutoffNow = new Date("2026-07-07T12:00:00.000Z");
    const nowSpy = jest
      .spyOn(Date, "now")
      .mockReturnValue(mixedCutoffNow.getTime());
    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        deliveryDays: [0, 3],
        cutoffDaysBefore: 1,
        cutoffTime: "10:00",
      },
      { upsert: true },
    );

    const { variant: sundayVariant } = await createTestProduct();
    const { variant: wednesdayVariant } = await createTestProduct();

    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDays: [0, 3],
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });
    expect(createRes.status).toBe(201);
    const subId = createRes.body.data.subscription._id;

    const stageWednesdayRes = await request(app)
      .patch(`/api/portal/subscriptions/${subId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        changedDeliveryDays: [3],
        deliveryDayPlans: [
          { day: 0, items: [{ variantId, quantity: 1 }] },
          {
            day: 3,
            items: [
              { variantId, quantity: 1 },
              { variantId: wednesdayVariant._id.toString(), quantity: 1 },
            ],
          },
        ],
      });

    expect(stageWednesdayRes.status).toBe(200);
    expect(stageWednesdayRes.body.data.appliedTo).toBe("next");

    stripe.paymentIntents.create.mockClear();

    const sundayUpdateRes = await request(app)
      .patch(`/api/portal/subscriptions/${subId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        changedDeliveryDays: [0],
        deliveryDayPlans: [
          {
            day: 0,
            items: [
              { variantId, quantity: 1 },
              { variantId: sundayVariant._id.toString(), quantity: 1 },
            ],
          },
          {
            day: 3,
            items: [
              { variantId, quantity: 1 },
              { variantId: wednesdayVariant._id.toString(), quantity: 1 },
            ],
          },
        ],
      });

    expect(sundayUpdateRes.status).toBe(200);
    expect(sundayUpdateRes.body.data.appliedTo).toBe("upcoming");
    expect(sundayUpdateRes.body.data.chargedMinor).toBe(250);
    expect(stripe.paymentIntents.create).toHaveBeenCalled();

    const stored = await Subscription.findById(subId).lean();
    expect(stored.pendingChanges).toBeTruthy();
    expect(
      stored.pendingChanges.deliveryDayPlans.find(
        (plan) => Number(plan.day) === 3,
      )?.items.length,
    ).toBe(2);
    nowSpy.mockRestore();
  });

  it("increasing one day's item only updates that day's generated order", async () => {
    const mixedCutoffNow = new Date("2026-07-07T12:00:00.000Z");
    const nowSpy = jest
      .spyOn(Date, "now")
      .mockReturnValue(mixedCutoffNow.getTime());
    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        deliveryDays: [0, 3],
        cutoffDaysBefore: 1,
        cutoffTime: "10:00",
      },
      { upsert: true },
    );

    const { variant: extraVariant } = await createTestProduct();

    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDays: [0, 3],
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });
    expect(createRes.status).toBe(201);
    const sub = createRes.body.data.subscription;

    const baseOrderItem = {
      product: sub.items[0].product,
      variant: sub.items[0].variant,
      name: sub.items[0].name,
      sku: sub.items[0].sku,
      price: sub.items[0].unitPrice,
      quantity: 1,
      subtotal: sub.items[0].unitPrice,
    };

    const orderCommon = {
      customer: customer._id,
      deliveryAddress: {
        line1: "1 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
      },
      customerInstructions: "",
      location: { lat: 51.5, lng: -0.1 },
      deliveryFee: 0,
      subtotal: baseOrderItem.subtotal,
      total: baseOrderItem.subtotal,
      amountPaid: baseOrderItem.subtotal,
      status: "paid",
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      orderType: "subscription_generated",
      subscription: sub._id,
    };

    // Upcoming Sunday (2026-07-12) and Wednesday (2026-07-15) orders, one item each.
    const sundayOrder = await Order.create({
      ...orderCommon,
      items: [{ ...baseOrderItem }],
      deliveryDate: new Date("2026-07-12T09:00:00.000Z"),
      stripePaymentIntentId: `pi_sun_${crypto.randomUUID().slice(0, 8)}`,
      paidAt: new Date(),
    });
    const wednesdayOrder = await Order.create({
      ...orderCommon,
      items: [{ ...baseOrderItem }],
      deliveryDate: new Date("2026-07-15T09:00:00.000Z"),
      stripePaymentIntentId: `pi_wed_${crypto.randomUUID().slice(0, 8)}`,
      paidAt: new Date(),
    });

    // Add an item to Sunday only, before Sunday's cut-off.
    const updateRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        changedDeliveryDays: [0],
        deliveryDayPlans: [
          {
            day: 0,
            items: [
              { variantId, quantity: 1 },
              { variantId: extraVariant._id.toString(), quantity: 1 },
            ],
          },
          { day: 3, items: [{ variantId, quantity: 1 }] },
        ],
      });

    expect(updateRes.status).toBe(200);

    const storedSunday = await Order.findById(sundayOrder._id).lean();
    const storedWednesday = await Order.findById(wednesdayOrder._id).lean();

    // Sunday order now has both items (its own plan), Wednesday order unchanged.
    expect(storedSunday.items).toHaveLength(2);
    expect(
      storedSunday.items.every((item) => Number(item.quantity) === 1),
    ).toBe(true);
    expect(storedWednesday.items).toHaveLength(1);
    expect(Number(storedWednesday.items[0].quantity)).toBe(1);

    nowSpy.mockRestore();
  });

  it("reducing multi-day subscription to single day clears day plans", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDays: [0, 3],
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });
    expect(createRes.status).toBe(201);
    const subId = createRes.body.data.subscription._id;

    const future = new Date();
    future.setDate(future.getDate() + 10);
    future.setHours(9, 0, 0, 0);
    await Subscription.findByIdAndUpdate(subId, { nextDeliveryDate: future });

    const updateRes = await request(app)
      .patch(`/api/portal/subscriptions/${subId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ preferredDeliveryDays: [0], preferredDeliveryDay: 0 });

    expect(updateRes.status).toBe(200);
    const stored = await Subscription.findById(subId).lean();
    expect(stored.preferredDeliveryDays).toEqual([0]);
    expect(stored.preferredDeliveryDay).toBe(0);
  });

  it("resume keeps retained slot when available and recalculates when none exists", async () => {
    const subWithSlot = await createBasicSubscription();
    const slotDate = new Date();
    slotDate.setDate(slotDate.getDate() + 2);
    slotDate.setHours(9, 0, 0, 0);

    await Subscription.findByIdAndUpdate(subWithSlot._id, {
      status: "paused",
      pausedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      nextDeliveryDate: null,
    });
    await SubscriptionDelivery.create({
      subscription: subWithSlot._id,
      customer: customer._id,
      scheduledDate: slotDate,
      status: "scheduled",
    });

    const resumeWithSlot = await request(app)
      .post(`/api/portal/subscriptions/${subWithSlot._id}/resume`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(resumeWithSlot.status).toBe(200);
    const resumedWithSlot = await Subscription.findById(subWithSlot._id).lean();
    expect(new Date(resumedWithSlot.nextDeliveryDate).toISOString()).toBe(
      slotDate.toISOString(),
    );

    const subNoSlot = await createBasicSubscription();
    await Subscription.findByIdAndUpdate(subNoSlot._id, {
      status: "paused",
      pausedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      nextDeliveryDate: null,
    });
    await SubscriptionDelivery.deleteMany({ subscription: subNoSlot._id });

    const resumeNoSlot = await request(app)
      .post(`/api/portal/subscriptions/${subNoSlot._id}/resume`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(resumeNoSlot.status).toBe(200);
    const resumedNoSlot = await Subscription.findById(subNoSlot._id).lean();
    expect(resumedNoSlot.nextDeliveryDate).toBeTruthy();
  });

  it("update delivery details and frequency handles before/after cutoff branches", async () => {
    const sub = await createBasicSubscription();

    const beforeRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ frequency: "every_two_weeks", notes: "updated note" });
    expect(beforeRes.status).toBe(200);

    const customerDoc = await Customer.findById(customer._id).lean();
    const knownAddressId = customerDoc.addresses[0]._id.toString();
    const unknownAddressId =
      new (require("mongoose").Types.ObjectId)().toString();

    const unknownAddressRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ deliveryAddressId: unknownAddressId });
    expect(unknownAddressRes.status).toBe(400);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: tomorrow,
    });

    const afterRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ deliveryAddressId: knownAddressId });
    expect(afterRes.status).toBe(200);
    const afterStored = await Subscription.findById(sub._id).lean();
    expect(afterStored.pendingChanges).toBeTruthy();

    const noOpRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ notes: afterStored.notes || null });
    expect(noOpRes.status).toBe(200);

    const noDayRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ preferredDeliveryDay: null, preferredDeliveryDays: [] });
    expect(noDayRes.status).toBe(400);
  });

  it("changes delivery day before cut-off immediately and recalculates next delivery", async () => {
    const sub = await createBasicSubscription();
    const before = await Subscription.findById(sub._id).lean();

    const res = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ preferredDeliveryDay: 3, preferredDeliveryDays: [3] });

    expect(res.status).toBe(200);

    const after = await Subscription.findById(sub._id).lean();
    expect(after.preferredDeliveryDay).toBe(3);
    expect(after.preferredDeliveryDays).toEqual([3]);

    const afterWeekday = new Date(after.nextDeliveryDate).getDay();
    expect(afterWeekday).toBe(3);
    expect(new Date(after.nextDeliveryDate).getTime()).not.toBe(
      new Date(before.nextDeliveryDate).getTime(),
    );
  });

  it("settings service enforces defaults and non-empty delivery days", async () => {
    await SubscriptionSettings.deleteMany({});
    const created =
      await require("../../services/subscriptionSettings.service").getOrCreateSettings();
    expect(created.deliveryDays).toEqual([0, 3]);

    const updateEmpty =
      await require("../../services/subscriptionSettings.service").updateSettings(
        {
          data: { deliveryDays: [] },
          userId: null,
        },
      );
    expect(updateEmpty.error).toBeTruthy();

    const updateNarrow =
      await require("../../services/subscriptionSettings.service").updateSettings(
        {
          data: { deliveryDays: [0] },
          userId: null,
        },
      );
    expect(updateNarrow.data.deliveryDays).toEqual([0]);

    const rejectNowUnavailable = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 3,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });
    expect(rejectNowUnavailable.status).toBe(400);
  });

  it("decrease before cut-off with card refund refunds order payment", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 3 }],
      });
    expect(createRes.status).toBe(201);
    const sub = createRes.body.data.subscription;
    const itemId = sub.items[0]._id;

    const subtotal = sub.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    const paymentIntentId = `pi_paid_${crypto.randomUUID().slice(0, 8)}`;

    const order = await Order.create({
      customer: customer._id,
      items: sub.items.map((item) => ({
        product: item.product,
        variant: item.variant,
        name: item.name,
        sku: item.sku,
        price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
      })),
      deliveryAddress: {
        line1: "1 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
      },
      customerInstructions: "",
      location: { lat: 51.5, lng: -0.1 },
      deliveryDate: new Date(sub.nextDeliveryDate),
      deliveryFee: 0,
      subtotal,
      total: subtotal,
      amountPaid: subtotal,
      status: "paid",
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      orderType: "subscription_generated",
      subscription: sub._id,
      stripePaymentIntentId: paymentIntentId,
      paidAt: new Date(),
    });

    const updateRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}/items/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ quantity: 1, refundMethod: "refund" });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.message).toMatch(/refunded/i);
    expect(updateRes.body.data.refundedMinor).toBe(500);
    expect(stripe.refunds.create).toHaveBeenCalled();

    const updatedOrder = await Order.findById(order._id).lean();
    expect(updatedOrder.status).toBe("partially_refunded");
  });

  it("rejects card refund decrease when no captured payment exists", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 3 }],
      });
    expect(createRes.status).toBe(201);
    const sub = createRes.body.data.subscription;
    const itemId = sub.items[0]._id;

    const updateRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}/items/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ quantity: 1, refundMethod: "refund" });

    expect(updateRes.status).toBe(400);
    expect(updateRes.body.message).toMatch(/captured payment/i);
  });

  it("removes a non-last item before cut-off", async () => {
    const { variant: secondVariant } = await createTestProduct();

    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [
          { variantId, quantity: 1 },
          { variantId: secondVariant._id.toString(), quantity: 1 },
        ],
      });
    expect(createRes.status).toBe(201);

    const sub = createRes.body.data.subscription;
    const removeItemId = sub.items[0]._id;

    const removeRes = await request(app)
      .delete(`/api/portal/subscriptions/${sub._id}/items/${removeItemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refundMethod: "credit" });

    expect(removeRes.status).toBe(200);
    expect(removeRes.body.data.subscription.items).toHaveLength(1);
  });

  it("creates exactly three upcoming slots and keeps delivery dates unique", async () => {
    const sub = await createBasicSubscription();

    const deliveriesRes = await request(app)
      .get(`/api/portal/subscriptions/${sub._id}/deliveries`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(deliveriesRes.status).toBe(200);

    const deliveries = deliveriesRes.body.data.deliveries;
    expect(deliveries).toHaveLength(3);

    const dayKeys = deliveries.map(
      (d) => new Date(d.scheduledDate).toISOString().split("T")[0],
    );
    expect(new Set(dayKeys).size).toBe(3);
  });

  it("returns deliveries for owner and rejects deliveries access for other customer", async () => {
    const sub = await createBasicSubscription();

    const ownRes = await request(app)
      .get(`/api/portal/subscriptions/${sub._id}/deliveries`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(ownRes.status).toBe(200);
    expect(Array.isArray(ownRes.body.data.deliveries)).toBe(true);

    const other = await createPortalCustomer();
    const otherAuth = await loginPortalCustomer(other);

    const otherRes = await request(app)
      .get(`/api/portal/subscriptions/${sub._id}/deliveries`)
      .set("Authorization", `Bearer ${otherAuth.accessToken}`);

    expect(otherRes.status).toBe(404);
  });

  it("cutoff boundary at exact cutoff treats changes as after-cutoff", async () => {
    const now = new Date();
    const cutoffAt = new Date(now.getTime() + 2 * 60 * 1000);
    cutoffAt.setSeconds(0, 0);

    const hh = String(cutoffAt.getHours()).padStart(2, "0");
    const mm = String(cutoffAt.getMinutes()).padStart(2, "0");
    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        deliveryDays: [0, 1, 2, 3, 4, 5, 6],
        cutoffDaysBefore: 0,
        cutoffTime: `${hh}:${mm}`,
      },
      { upsert: true },
    );

    const sub = await createBasicSubscription();
    const nextDelivery = new Date(cutoffAt);
    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: nextDelivery,
    });

    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(cutoffAt.getTime());

    const res = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ variantId, quantity: 1 });

    nowSpy.mockRestore();

    expect(res.status).toBe(200);
    expect(res.body.data.appliedTo).toBe("next");

    const stored = await Subscription.findById(sub._id).lean();
    expect(stored.pendingChanges).toBeTruthy();
    expect(Array.isArray(stored.pendingChanges.items)).toBe(true);
  });

  it("just before cutoff applies item changes to upcoming delivery", async () => {
    const now = new Date();
    const cutoffAt = new Date(now.getTime() + 3 * 60 * 1000);
    cutoffAt.setSeconds(0, 0);

    const hh = String(cutoffAt.getHours()).padStart(2, "0");
    const mm = String(cutoffAt.getMinutes()).padStart(2, "0");
    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        deliveryDays: [0, 1, 2, 3, 4, 5, 6],
        cutoffDaysBefore: 0,
        cutoffTime: `${hh}:${mm}`,
      },
      { upsert: true },
    );

    const sub = await createBasicSubscription();
    const nextDelivery = new Date(cutoffAt);
    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: nextDelivery,
    });

    const cutoffMinusOneMinute = cutoffAt.getTime() - 60 * 1000;
    const nowSpy = jest
      .spyOn(Date, "now")
      .mockReturnValue(cutoffMinusOneMinute);

    const res = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ variantId, quantity: 1 });

    nowSpy.mockRestore();

    expect(res.status).toBe(200);
    expect(res.body.data.appliedTo).toBe("upcoming");

    const stored = await Subscription.findById(sub._id).lean();
    expect(stored.pendingChanges).toBeNull();
  });

  it("just after cutoff stages item changes for next delivery", async () => {
    const now = new Date();
    const cutoffAt = new Date(now.getTime() + 2 * 60 * 1000);
    cutoffAt.setSeconds(0, 0);

    const hh = String(cutoffAt.getHours()).padStart(2, "0");
    const mm = String(cutoffAt.getMinutes()).padStart(2, "0");
    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        deliveryDays: [0, 1, 2, 3, 4, 5, 6],
        cutoffDaysBefore: 0,
        cutoffTime: `${hh}:${mm}`,
      },
      { upsert: true },
    );

    const sub = await createBasicSubscription();
    const nextDelivery = new Date(cutoffAt);
    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: nextDelivery,
    });

    const cutoffPlusOneMinute = cutoffAt.getTime() + 60 * 1000;
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(cutoffPlusOneMinute);

    const res = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ variantId, quantity: 1 });

    nowSpy.mockRestore();

    expect(res.status).toBe(200);
    expect(res.body.data.appliedTo).toBe("next");

    const stored = await Subscription.findById(sub._id).lean();
    expect(stored.pendingChanges).toBeTruthy();
  });

  it("falls back to store credit when card refund cannot be processed", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 3 }],
      });
    expect(createRes.status).toBe(201);
    const sub = createRes.body.data.subscription;
    const itemId = sub.items[0]._id;

    const subtotal = sub.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    await Order.create({
      customer: customer._id,
      items: sub.items.map((item) => ({
        product: item.product,
        variant: item.variant,
        name: item.name,
        sku: item.sku,
        price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
      })),
      deliveryAddress: {
        line1: "1 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
      },
      customerInstructions: "",
      location: { lat: 51.5, lng: -0.1 },
      deliveryDate: new Date(sub.nextDeliveryDate),
      deliveryFee: 0,
      subtotal,
      total: subtotal,
      amountPaid: subtotal,
      status: "paid",
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      orderType: "subscription_generated",
      subscription: sub._id,
      stripePaymentIntentId: `pi_paid_${crypto.randomUUID().slice(0, 8)}`,
      paidAt: new Date(),
    });

    stripe.refunds.create.mockRejectedValueOnce(
      new Error("no refundable balance"),
    );

    const updateRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}/items/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ quantity: 1, refundMethod: "refund" });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.refundedMinor).toBe(0);
    expect(updateRes.body.data.creditedMinor).toBe(500);
    expect(updateRes.body.message).toMatch(/store credit/i);

    const refreshedCustomer = await Customer.findById(customer._id).lean();
    expect(refreshedCustomer.creditBalance).toBe(500);

    const creditTx = await StoreCreditTransaction.findOne({
      customer: customer._id,
      type: "subscription_refund",
    }).lean();
    expect(creditTx).toBeTruthy();
  });
});

describe("Portal Support Requests", () => {
  let accessToken;

  beforeEach(async () => {
    const creds = await createPortalCustomer();
    const auth = await loginPortalCustomer(creds);
    accessToken = auth.accessToken;
  });

  it("creates a support request", async () => {
    const res = await request(app)
      .post("/api/portal/support-requests")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        issueType: "general_enquiry",
        subject: "Test subject",
        message: "This is a test support message from a portal customer.",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.request.status).toBe("open");
  });

  it("lists only own support requests", async () => {
    // Create request with first customer
    await request(app)
      .post("/api/portal/support-requests")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        issueType: "delivery_issue",
        subject: "Missing delivery",
        message: "My delivery was not received.",
      });

    const res = await request(app)
      .get("/api/portal/support-requests")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.requests)).toBe(true);
    expect(res.body.data.requests.length).toBeGreaterThan(0);
  });
});
