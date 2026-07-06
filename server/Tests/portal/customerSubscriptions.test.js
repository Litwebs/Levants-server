"use strict";

const request = require("supertest");
const app = require("../testApp");
const { createPortalCustomer, loginPortalCustomer } = require("./helpers");
const Product = require("../../models/product.model");
const ProductVariant = require("../../models/variant.model");
const Customer = require("../../models/customer.model");
const Subscription = require("../../models/subscription.model");
const SubscriptionDelivery = require("../../models/subscriptionDelivery.model");
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

    // Cancel
    const cancelRes = await request(app)
      .post(`/api/portal/subscriptions/${subId}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "No longer needed" });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.subscription.status).toBe("cancelled");
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
