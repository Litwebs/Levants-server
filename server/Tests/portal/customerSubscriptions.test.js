"use strict";

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../testApp");
const { createPortalCustomer, loginPortalCustomer } = require("./helpers");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");
const Product = require("../../models/product.model");
const ProductVariant = require("../../models/variant.model");
const Customer = require("../../models/customer.model");
const Subscription = require("../../models/subscription.model");
const SubscriptionMutation = require("../../models/subscriptionMutation.model");
const SubscriptionDelivery = require("../../models/subscriptionDelivery.model");
const CustomerNotification = require("../../models/customerNotification.model");
const Order = require("../../models/order.model");
const Payment = require("../../models/payment.model");
const StoreCreditTransaction = require("../../models/storeCreditTransaction.model");
const stripe = require("../../utils/stripe.util");
const SubscriptionSettings = require("../../models/subscriptionSettings.model");
const subscriptionService = require("../../services/customerPortal/customerSubscriptions.service");
const storeCreditService = require("../../services/storeCredit.service");
const refundService = require("../../services/orders/orders.refund.service");
const {
  SUBSCRIPTION_TIME_ZONE,
  addCalendarDaysInTimeZone,
  computeSubscriptionCutoffDate,
  formatDateKeyInTimeZone,
  startOfDayInTimeZone,
  weekdayInTimeZone,
  zonedParts,
} = require("../../utils/subscriptionCutoff.util");
const crypto = require("crypto");
const subscriptionClock = require("../../utils/subscriptionClock.util");

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
      list: jest.fn(async () => ({ data: [], has_more: false })),
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
      retrieve: jest.fn(async id => ({ id, status: "succeeded", amount_received: 100000 })),
      create: jest.fn(async params => ({
        ...params, amount_received: params.amount,
        id: `pi_test_${++paymentIntentCounter}`,
        status: "succeeded",
      })),
    },
    refunds: {
      list: jest.fn(async () => ({ data: [], has_more: false })),
      retrieve: jest.fn(async id => ({ id, status: "succeeded" })),
      create: jest.fn(async params => ({ id: `re_test_${++refundCounter}`, status: "succeeded", amount: params.amount })),
    },
    invoices: {
      retrieve: jest.fn(),
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

// Preserve the baseline provider behavior, including counter closures. Clear
// one-off outcomes and per-test implementations before every scenario.
const stripeMockDefaults = Object.values(stripe).flatMap(group =>
  Object.values(group).filter(value => jest.isMockFunction(value))
    .map(mock => ({ mock, implementation: mock.getMockImplementation() })));

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

  afterEach(() => jest.useRealTimers());

  beforeEach(async () => {
    for (const { mock, implementation } of stripeMockDefaults) mock.mockReset().mockImplementation(implementation);
    stripe.customers.retrieve.mockResolvedValue({
      id: "cus_test_mock",
      deleted: false,
      invoice_settings: { default_payment_method: "pm_test_default" },
    });
    stripe.testHelpers.testClocks.retrieve.mockResolvedValue({
      id: "clock_test",
      frozen_time: null,
    });

    const creds = await createPortalCustomer();
    customer = creds.customer;
    stripe.paymentIntents.retrieve.mockImplementation(async id => ({ id, status: "succeeded",
      amount_received: 100000, currency: "gbp", customer: customer.stripeCustomerId }));
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
        operationId: crypto.randomUUID(),
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(createRes.status).toBe(201);
    return createRes.body.data.subscription;
  }

  async function prepareUpcomingDeliveries(subscriptionId) {
    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        deliveryDays: [0, 1, 2, 3, 4, 5, 6],
        cutoffDaysBefore: 0,
        cutoffTime: "23:59",
      },
      { upsert: true },
    );

    const deliveries = await SubscriptionDelivery.find({
      subscription: subscriptionId,
    }).sort({ scheduledDate: 1 });
    for (let index = 0; index < deliveries.length; index += 1) {
      const scheduledDate = new Date(
        Date.now() + (index + 7) * 24 * 60 * 60 * 1000,
      );
      scheduledDate.setHours(12, 0, 0, 0);
      deliveries[index].scheduledDate = scheduledDate;
      await deliveries[index].save();
    }
    await Subscription.findByIdAndUpdate(subscriptionId, {
      nextDeliveryDate: deliveries[0].scheduledDate,
    });
    return deliveries;
  }

  it.each(["updated", "failed-invoice"])("defers %s lifecycle events until a paid item increase is recovered", async eventType => {
    const sub = await createBasicSubscription();
    const mutation = await SubscriptionMutation.create({
      customer: customer._id, subscription: sub._id, operationId: crypto.randomUUID(),
      mutationType: "update_subscription_item", requestHash: "frozen-increase", status: "failed",
      itemIncreaseSnapshot: { baseVersion: sub.customerVersion, amountMinor: 250,
        paymentIntent: { id: "pi_paid_awaiting_local_commit", status: "succeeded", amount_received: 250 } },
    });
    const fields = "status customerVersion pausedAt pausedUntil pauseReason items deliveryDayPlans nextDeliveryDate";
    const before = await Subscription.findById(sub._id).select(fields).lean();
    const payments = await Payment.find({ subscription: sub._id }).lean();
    const providerWrites = stripe.subscriptions.update.mock.calls.length;
    const charges = stripe.paymentIntents.create.mock.calls.length;
    const refunds = stripe.refunds.create.mock.calls.length;
    stripe.subscriptions.retrieve.mockResolvedValue({ id: sub.stripeSubscriptionId,
      status: "active", pause_collection: { behavior: "void" } });
    stripe.invoices.retrieve.mockResolvedValue({ id: "in_pending_increase", subscription: sub.stripeSubscriptionId,
      status: "open", paid: false });
    const webhook = require("../../services/subscriptions/subscriptionWebhook.service");
    const invoke = () => eventType === "updated"
      ? webhook.HandleStripeSubscriptionUpdated({ id: sub.stripeSubscriptionId })
      : webhook.HandleSubscriptionInvoiceFailed({ id: "in_pending_increase", subscription: sub.stripeSubscriptionId });
    await expect(invoke()).rejects.toMatchObject({ statusCode: 503, code: "SUBSCRIPTION_LIFECYCLE_BUSY" });
    expect(await Subscription.findById(sub._id).select(fields).lean()).toEqual(before);
    expect(await Payment.find({ subscription: sub._id }).lean()).toEqual(payments);
    expect(stripe.subscriptions.update.mock.calls).toHaveLength(providerWrites);
    expect(stripe.paymentIntents.create.mock.calls).toHaveLength(charges);
    expect(stripe.refunds.create.mock.calls).toHaveLength(refunds);
    expect((await SubscriptionMutation.findById(mutation._id)).itemIncreaseSnapshot.paymentIntent.id)
      .toBe("pi_paid_awaiting_local_commit");
    await SubscriptionMutation.updateOne({ _id: mutation._id }, { $set: { status: "completed" } });
    await invoke();
    expect((await Subscription.findById(sub._id)).status).toBe("paused");
  });

  it("creates a subscription", async () => {
    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
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

  it("creates the first fulfillment order synchronously when Stripe returns a paid invoice", async () => {
    stripe.subscriptions.create.mockResolvedValueOnce({
      id: "sub_test_initial_paid_fallback",
      latest_invoice: {
        id: "in_test_initial_paid_fallback",
        subscription: "sub_test_initial_paid_fallback",
        payment_intent: "pi_test_initial_paid_fallback",
        paid: true,
        status: "paid",
        currency: "gbp",
        status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
      },
    });

    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    const orders = await Order.find({
      subscription: res.body.data.subscription._id,
      stripeInvoiceId: "in_test_initial_paid_fallback",
    }).lean();
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("paid");
  });

  it("rejects creation without a durable operation identity before payment", async () => {
    stripe.subscriptions.create.mockClear();
    const response = await request(app).post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`).send({ frequency: "weekly", preferredDeliveryDay: 0,
        deliveryAddressId: addressId, items: [{ variantId, quantity: 1 }] });
    expect(response.status).toBe(400);
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        notes: "Leave by the side gate",
        items: [{ variantId, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.subscription.notes).toBe("Leave by the side gate");
  });

  it("uses subscription-specific delivery instructions", async () => {
    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        deliveryInstructions: "Leave inside the porch",
        items: [{ variantId, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect(
      res.body.data.subscription.deliveryAddress.deliveryInstructions,
    ).toBe("Leave inside the porch");
  });

  it("does not duplicate legacy UTC-midnight slots that are the same London delivery day", async () => {
    jest.spyOn(subscriptionClock, "now").mockReturnValue(new Date("2026-07-01T12:00:00Z").getTime());
    const sub = await createBasicSubscription();
    await SubscriptionDelivery.deleteMany({ subscription: sub._id });

    // Simulate slots created on a UTC-hosted server before business-timezone
    // normalization. During BST these are 01:00 local, but still the intended
    // Sunday delivery dates.
    const legacySlots = [
      new Date("2026-07-05T00:00:00.000Z"),
      new Date("2026-07-12T00:00:00.000Z"),
    ];
    await SubscriptionDelivery.insertMany(
      legacySlots.map((scheduledDate) => ({
        subscription: sub._id,
        customer: customer._id,
        scheduledDate,
        status: "scheduled",
      })),
    );
    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: legacySlots[0],
      preferredDeliveryDay: 0,
      preferredDeliveryDays: [0],
      frequency: "weekly",
    });

    const refreshed = await Subscription.findById(sub._id);
    await subscriptionService.scheduleUpcomingDeliveries(refreshed);

    const slots = await SubscriptionDelivery.find({
      subscription: sub._id,
      status: "scheduled",
    })
      .sort({ scheduledDate: 1 })
      .lean();

    const dateKeys = slots.map((slot) =>
      formatDateKeyInTimeZone(
        slot.scheduledDate,
        SUBSCRIPTION_TIME_ZONE,
      ),
    );

    expect(slots).toHaveLength(3);
    expect(new Set(dateKeys).size).toBe(3);
    expect(dateKeys).toEqual([
      "2026-07-05",
      "2026-07-12",
      "2026-07-19",
    ]);
  });


  it("sets next delivery to next-week occurrence when selected day is today", async () => {
    const todayWeekday = weekdayInTimeZone(
      new Date(),
      SUBSCRIPTION_TIME_ZONE,
    );

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
        operationId: crypto.randomUUID(),
        frequency: "weekly",
        preferredDeliveryDay: todayWeekday,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(res.status).toBe(201);

    const nextDelivery = new Date(res.body.data.subscription.nextDeliveryDate);
    const expected = addCalendarDaysInTimeZone(
      new Date(),
      7,
      SUBSCRIPTION_TIME_ZONE,
    );
    expect(
      formatDateKeyInTimeZone(nextDelivery, SUBSCRIPTION_TIME_ZONE),
    ).toBe(formatDateKeyInTimeZone(expected, SUBSCRIPTION_TIME_ZONE));
    expect(
      weekdayInTimeZone(nextDelivery, SUBSCRIPTION_TIME_ZONE),
    ).toBe(todayWeekday);
  });

  it("uses the immediate upcoming Sunday when subscribing on Friday before cutoff", async () => {
    const fixedNow = new Date("2026-05-08T12:00:00.000Z");
    const nowSpy = jest.spyOn(subscriptionClock, "now").mockReturnValue(fixedNow.getTime());

    try {
      await SubscriptionSettings.findOneAndUpdate(
        { singletonKey: "subscription-settings" },
        {
          singletonKey: "subscription-settings",
          deliveryDays: [0, 1, 2, 3, 4, 5, 6],
          cutoffDaysBefore: 2,
          cutoffTime: "22:00",
        },
        { upsert: true },
      );

      const res = await request(app)
        .post("/api/portal/subscriptions")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
        operationId: crypto.randomUUID(),
          frequency: "weekly",
          preferredDeliveryDay: 0,
          deliveryAddressId: addressId,
          items: [{ variantId, quantity: 1 }],
        });

      expect(res.status).toBe(201);

      const nextDelivery = new Date(
        res.body.data.subscription.nextDeliveryDate,
      );
      expect(
        weekdayInTimeZone(nextDelivery, SUBSCRIPTION_TIME_ZONE),
      ).toBe(0);
      expect(
        formatDateKeyInTimeZone(nextDelivery, SUBSCRIPTION_TIME_ZONE),
      ).toBe("2026-05-10");
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("rejects create when stripe customer cannot be retrieved", async () => {
    stripe.customers.retrieve.mockRejectedValueOnce(new Error("Stripe down"));

    const res = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
      .map((d) =>
        weekdayInTimeZone(d.scheduledDate, SUBSCRIPTION_TIME_ZONE),
      );
    expect(weekdays.every((day) => [0, 3].includes(day))).toBe(true);
    expect(new Set(weekdays).size).toBeGreaterThan(1);
  });

  it.each([
    [[0], "Updated admin note"], [[0], null],
    [[0, 3], "Updated admin note"], [[0, 3], null],
  ])("admin notes-only PATCH preserves schedule and finances for days %j and note %j", async (days, notes) => {
    const created = await request(app).post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`).send({
        operationId: crypto.randomUUID(), frequency: "weekly",
        preferredDeliveryDay: days[0], preferredDeliveryDays: days,
        deliveryAddressId: addressId, notes: "Original note",
        ...(days.length === 1
          ? { items: [{ variantId, quantity: 1 }] }
          : { deliveryDayPlans: days.map((day, index) => ({ day, items: [{ variantId, quantity: index + 1 }] })) }),
      });
    expect({ status: created.status, message: created.body.message }).toMatchObject({ status: 201 });
    const sub = created.body.data.subscription;
    const fields = "status frequency preferredDeliveryDay preferredDeliveryDays items deliveryDayPlans pendingChanges nextDeliveryDate stripeSubscriptionId stripePriceId deliveryAddress";
    const before = await Subscription.findById(sub._id).select(fields).lean();
    const deliveries = await SubscriptionDelivery.find({ subscription: sub._id }).sort({ _id: 1 }).lean();
    const payments = await Payment.find({ subscription: sub._id }).sort({ _id: 1 }).lean();
    const Order = require("../../models/order.model");
    const CreditTransaction = require("../../models/storeCreditTransaction.model");
    const orders = await Order.find({ subscription: sub._id }).sort({ _id: 1 }).lean();
    const creditTransactions = await CreditTransaction.find({ customer: customer._id }).sort({ _id: 1 }).lean();
    const balance = (await Customer.findById(customer._id)).creditBalance;
    const providerCalls = [stripe.subscriptions.update, stripe.paymentIntents.create, stripe.refunds.create]
      .map(mock => mock.mock.calls.length);
    const admin = await createUser({ role: "admin" });
    const auth = await request(app).post("/api/auth/login").send({ email: admin.email, password: "secret123" });
    const response = await request(app).patch(`/api/admin/subscriptions/${sub._id}`)
      .set("Cookie", getSetCookieHeader(auth)).send({ notes, expectedVersion: sub.customerVersion });
    expect(response.status).toBe(200);
    expect((await Subscription.findById(sub._id)).notes).toBe(notes);
    expect(await Subscription.findById(sub._id).select(fields).lean()).toEqual(before);
    expect(await SubscriptionDelivery.find({ subscription: sub._id }).sort({ _id: 1 }).lean()).toEqual(deliveries);
    expect(await Payment.find({ subscription: sub._id }).sort({ _id: 1 }).lean()).toEqual(payments);
    expect(await Order.find({ subscription: sub._id }).sort({ _id: 1 }).lean()).toEqual(orders);
    expect(await CreditTransaction.find({ customer: customer._id }).sort({ _id: 1 }).lean()).toEqual(creditTransactions);
    expect((await Customer.findById(customer._id)).creditBalance).toBe(balance);
    expect([stripe.subscriptions.update, stripe.paymentIntents.create, stripe.refunds.create]
      .map(mock => mock.mock.calls.length)).toEqual(providerCalls);
  });

  it.each([0, 1])("extends three upcoming slots from a stale date (%i days after Sunday)", async (daysAfterSunday) => {
    const sub = await createBasicSubscription();
    // Exercise both a delivery day and the following day using fixed absolute
    // instants. Assertions are made against the London business calendar.
    const now = new Date(
      daysAfterSunday === 0
        ? "2026-09-06T14:38:00.000Z"
        : "2026-09-07T14:38:00.000Z",
    );
    const clockSpy = jest.spyOn(subscriptionClock, "now").mockReturnValue(now.getTime());
    try {
      const today = startOfDayInTimeZone(now, SUBSCRIPTION_TIME_ZONE);
      const staleDate = new Date("2026-08-02T08:00:00.000Z");
      await Subscription.findByIdAndUpdate(sub._id, {
        nextDeliveryDate: staleDate,
      });
      await SubscriptionDelivery.deleteMany({ subscription: sub._id });

      const stored = await Subscription.findById(sub._id);
      await subscriptionService.scheduleUpcomingDeliveries(stored);

      const futureSlots = await SubscriptionDelivery.find({
        subscription: sub._id,
        scheduledDate: { $gte: today },
      }).sort({ scheduledDate: 1 }).lean();

      expect(futureSlots).toHaveLength(3);
      expect(
        futureSlots.every(
          (slot) =>
            weekdayInTimeZone(
              slot.scheduledDate,
              SUBSCRIPTION_TIME_ZONE,
            ) === 0,
        ),
      ).toBe(true);

      const expectedKeys =
        daysAfterSunday === 0
          ? ["2026-09-06", "2026-09-13", "2026-09-20"]
          : ["2026-09-13", "2026-09-20", "2026-09-27"];
      expect(
        futureSlots.map((slot) =>
          formatDateKeyInTimeZone(
            slot.scheduledDate,
            SUBSCRIPTION_TIME_ZONE,
          ),
        ),
      ).toEqual(expectedKeys);
    } finally {
      clockSpy.mockRestore();
    }
  });

  it("can pause, resume, and cancel subscription", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
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

  it("applies delivery-day changes after the current delivery cut-off", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
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
    expect(stored.pendingChanges).toBeNull();

    const scheduled = await SubscriptionDelivery.find({ subscription: subId })
      .sort({ scheduledDate: 1 })
      .lean();
    expect(scheduled.length).toBeGreaterThan(0);
  });

  it("selects the next delivery day whose own cut-off is still open", () => {
    const referenceDate = new Date("2026-08-11T12:00:00.000Z");
    const settings = { cutoffDaysBefore: 2, cutoffTime: "22:00" };

    const nextSunday =
      subscriptionService.calculateFirstSubscriptionDeliveryDate({
        frequency: "weekly",
        preferredDeliveryDay: 0,
        preferredDeliveryDays: [0],
        referenceDate,
        settings,
      });
    const nextWednesday =
      subscriptionService.calculateFirstSubscriptionDeliveryDate({
        frequency: "weekly",
        preferredDeliveryDay: 3,
        preferredDeliveryDays: [3],
        referenceDate,
        settings,
      });

    expect(
      formatDateKeyInTimeZone(nextSunday, SUBSCRIPTION_TIME_ZONE),
    ).toBe("2026-08-16");
    expect(
      formatDateKeyInTimeZone(nextWednesday, SUBSCRIPTION_TIME_ZONE),
    ).toBe("2026-08-19");
  });

  it("cannot access another customer's subscription", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
    expect(stripe.prices.create.mock.calls.at(-1)?.[0]?.unit_amount).toBe(850);
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
        operationId: crypto.randomUUID(),
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

  it("pause cancels open deliveries before the selected resume date", async () => {
    const sub = await createBasicSubscription();
    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      { cutoffDaysBefore: 0, cutoffTime: "23:59" },
      { upsert: true },
    );
    const nextDelivery = new Date(sub.nextDeliveryDate);
    // Anchor this slot to the test's pause window, not to nextDeliveryDate.
    // Earlier matrix tests intentionally move the billing anchor across
    // cut-offs, so deriving from it makes this assertion order-dependent.
    const later = new Date();
    later.setDate(later.getDate() + 7);
    later.setHours(9, 0, 0, 0);

    await SubscriptionDelivery.create({
      subscription: sub._id,
      customer: customer._id,
      scheduledDate: later,
      status: "scheduled",
    });

    const pauseRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/pause`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ resumeOn: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000) });
    expect(pauseRes.status).toBe(200);

    const deliveries = await SubscriptionDelivery.find({
      subscription: sub._id,
    }).lean();
    const upcoming = deliveries.find(
      (d) => new Date(d.scheduledDate).getTime() === nextDelivery.getTime(),
    );
    expect(["scheduled", "cancelled"]).toContain(upcoming?.status);
    const laterStored = deliveries.find(
      (d) => new Date(d.scheduledDate).getTime() === later.getTime(),
    );
    expect(laterStored?.status).toBe("cancelled");
  });

  it("pause fails safely if Stripe billing cannot be paused", async () => {
    const sub = await createBasicSubscription();
    stripe.subscriptions.update.mockRejectedValueOnce(
      new Error("stripe pause failure"),
    );

    const pauseRes = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/pause`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ resumeOn: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) });

    expect(pauseRes.status).toBe(400);
    const stored = await Subscription.findById(sub._id).lean();
    expect(stored.status).toBe("active");
  });

  it.each(["processing", "lost-response", "local-write"])("resume keeps one durable payment and activates atomically (%s)", async boundary => {
    const sub = await createBasicSubscription();
    const future = new Date(Date.now() + 7 * 86400000);
    await SubscriptionDelivery.deleteMany({ subscription: sub._id });
    await Subscription.updateOne({ _id: sub._id }, { $set: {
      nextDeliveryDate: future, status: "paused", pausedUntil: new Date(Date.now() - 60000) } });
    const order = await createPaidOrderFor({ ...sub, nextDeliveryDate: future });
    await SubscriptionDelivery.create({ subscription: sub._id, customer: customer._id,
      scheduledDate: future, status: "generated", order: order._id });
    stripe.refunds.list.mockResolvedValue({ data: [{ id: "re_resume", status: "succeeded",
      amount: 250, metadata: { orderId: String(order._id) } }], has_more: false });
    const succeeded = { id: `pi_resume_${boundary}`, status: "succeeded", amount: 250,
      amount_received: 250, customer: customer.stripeCustomerId, currency: "gbp" };
    stripe.paymentIntents.create.mockResolvedValue(succeeded);
    stripe.paymentIntents.retrieve.mockResolvedValue(succeeded);
    if (boundary === "processing") stripe.paymentIntents.create.mockResolvedValueOnce({ ...succeeded, status: "processing", amount_received: 0 });
    if (boundary === "lost-response") stripe.paymentIntents.create.mockRejectedValueOnce(new Error("provider response lost"));
    let saveSpy;
    if (boundary === "local-write") {
      const original = Order.prototype.save;
      saveSpy = jest.spyOn(Order.prototype, "save").mockImplementation(function (...args) {
        if (this.paymentAllocations.some(allocation => allocation.source === "resume")) throw new Error("resume order write failed");
        return original.apply(this, args);
      });
    }
    const operationId = crypto.randomUUID();
    const resume = () => request(app).post(`/api/portal/subscriptions/${sub._id}/resume`)
      .set("Authorization", `Bearer ${accessToken}`).send({ operationId });
    try {
      expect((await resume()).status).toBe(400);
      const failed = await Subscription.findById(sub._id).select("+resumePaymentPlan").lean();
      expect(failed.status).toBe("paused");
      expect(failed.resumePaymentPlan.completedAt).toBeFalsy();
      expect((await Order.findById(order._id)).paymentAllocations).toHaveLength(0);
      const conflict = await request(app).patch(`/api/portal/subscriptions/${sub._id}`)
        .set("Authorization", `Bearer ${accessToken}`).send({ notes: "conflicting edit", operationId: crypto.randomUUID() });
      expect(conflict.status).toBe(409);
      if (saveSpy) { saveSpy.mockRestore(); saveSpy = null; }
      expect((await resume()).status).toBe(200);
      expect((await resume()).status).toBe(200);
      const active = await Subscription.findById(sub._id).select("+resumePaymentPlan").lean();
      expect(active.status).toBe("active");
      expect(active.resumePaymentPlan.completedAt).toBeTruthy();
      const restored = await Order.findById(order._id).lean();
      expect(restored.paymentAllocations.filter(allocation => allocation.source === "resume")).toHaveLength(1);
      expect(await Payment.countDocuments({ subscription: sub._id, providerReference: succeeded.id })).toBe(1);
      if (boundary === "lost-response") expect(stripe.paymentIntents.create.mock.calls.at(-1)).toEqual(stripe.paymentIntents.create.mock.calls.at(-2));
      else expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    } finally { if (saveSpy) saveSpy.mockRestore(); }
  });

  it("does not charge a historical refunded invoice for an unrelated new resume slot", async () => {
    const sub = await createBasicSubscription();
    await Subscription.updateOne({ _id: sub._id }, { $set: { status: "paused", pausedUntil: new Date(Date.now() - 60000) } });
    stripe.refunds.list.mockResolvedValue({ data: [{ id: "re_old", status: "succeeded", amount: 250 }], has_more: false });
    stripe.paymentIntents.create.mockClear();
    const result = await request(app).post(`/api/portal/subscriptions/${sub._id}/resume`)
      .set("Authorization", `Bearer ${accessToken}`).send({ operationId: crypto.randomUUID() });
    expect(result.status).toBe(200);
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
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

  it("auto-resume respects an active portal worker and rechecks an extended pause after the candidate read", async () => {
    const sub = await createBasicSubscription();
    const due = new Date(Date.now() - 60000);
    await Subscription.findByIdAndUpdate(sub._id, { status: "paused", pausedUntil: due });
    const guard = require("../../services/customerPortal/subscriptionMutation.service").executeSubscriptionConcurrencyGuard;
    stripe.subscriptions.update.mockClear();
    await guard({ customerId: customer._id, subscriptionId: sub._id, operationId: "long-portal-edit", execute: async () => {
      expect(await subscriptionService.AutoResumePausedSubscriptions({ subscriptionId: sub._id })).toBe(0);
      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
      return { success: true };
    } });
    const original = Subscription.find;
    const future = new Date(Date.now() + 7 * 86400000);
    const queued = jest.spyOn(Subscription, "find").mockImplementation(async function (filter, ...rest) {
      const candidates = await original.call(this, filter, ...rest);
      if (filter.status === "paused") await Subscription.updateOne({ _id: sub._id }, { $set: { pausedUntil: future } });
      return candidates;
    });
    try {
      expect(await subscriptionService.AutoResumePausedSubscriptions({ subscriptionId: sub._id })).toBe(0);
      expect((await Subscription.findById(sub._id)).pausedUntil).toEqual(future);
      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    } finally { queued.mockRestore(); }
  });

  it("a long-running operation cannot reenter its own active subscription lock", async () => {
    const sub = await createBasicSubscription();
    const guard = require("../../services/customerPortal/subscriptionMutation.service").executeSubscriptionConcurrencyGuard;
    await guard({ customerId: customer._id, subscriptionId: sub._id, operationId: "same-operation", execute: async () => {
      const second = jest.fn(async () => ({ success: true }));
      const retried = await guard({ customerId: customer._id, subscriptionId: sub._id, operationId: "same-operation", execute: second });
      expect(retried.data.subscriptionBusy).toBe(true);
      expect(second).not.toHaveBeenCalled();
      return { success: true };
    } });
  });

  it("auto-resume isolates a Stripe failure and continues with other customers", async () => {
    const first = await createBasicSubscription();
    const second = await createBasicSubscription();
    const dueAt = new Date(Date.now() - 60 * 1000);
    await Subscription.updateMany(
      { _id: { $in: [first._id, second._id] } },
      { $set: { status: "paused", pausedUntil: dueAt, pausedAt: dueAt } },
    );
    stripe.subscriptions.update
      .mockRejectedValueOnce(new Error("temporary Stripe outage"))
      .mockResolvedValue({ id: "sub_resumed" });

    const resumed = await subscriptionService.AutoResumePausedSubscriptions();
    expect(resumed).toBe(1);

    const stored = await Subscription.find({
      _id: { $in: [first._id, second._id] },
    }).lean();
    expect(stored.filter((sub) => sub.status === "active")).toHaveLength(1);
    expect(stored.filter((sub) => sub.status === "paused")).toHaveLength(1);
  });

  it.each(["active", "paused"])("finalizes a %s scheduled cancellation after its locked delivery day exactly once", async status => {
    const sub = await createBasicSubscription();
    const lockedDate = new Date();
    lockedDate.setDate(lockedDate.getDate() + 2);
    lockedDate.setHours(9, 0, 0, 0);
    await Subscription.findByIdAndUpdate(sub._id, {
      status,
      isCancellationScheduled: true,
      cancellationEffectiveAfter: lockedDate,
    });

    const duringDay = new Date(lockedDate);
    duringDay.setHours(18, 0, 0, 0);
    expect(
      await subscriptionService.FinalizeScheduledCancellations({
        subscriptionId: sub._id,
        referenceDate: duringDay,
      }),
    ).toBe(0);

    const nextDay = new Date(lockedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(6, 0, 0, 0);
    expect(
      await subscriptionService.FinalizeScheduledCancellations({
        subscriptionId: sub._id,
        referenceDate: nextDay,
      }),
    ).toBe(1);
    expect(
      await subscriptionService.FinalizeScheduledCancellations({
        subscriptionId: sub._id,
        referenceDate: nextDay,
      }),
    ).toBe(0);

    const finalized = await Subscription.findById(sub._id).lean();
    expect(finalized.status).toBe("cancelled");
    expect(finalized.isCancellationScheduled).toBe(false);
    expect(finalized.cancellationEffectiveAfter).toBeNull();
  });

  it.each(["active", "paused"])("finalizes %s scheduled cancellation at the end of the London business day, not host UTC day", async status => {
    const sub = await createBasicSubscription();
    const lockedDate = new Date("2026-07-05T08:00:00.000Z");
    await Subscription.findByIdAndUpdate(sub._id, {
      status,
      isCancellationScheduled: true,
      cancellationEffectiveAfter: lockedDate,
    });

    expect(
      await subscriptionService.FinalizeScheduledCancellations({
        subscriptionId: sub._id,
        // 23:30 BST on the protected delivery date.
        referenceDate: new Date("2026-07-05T22:30:00.000Z"),
      }),
    ).toBe(0);

    expect(
      await subscriptionService.FinalizeScheduledCancellations({
        subscriptionId: sub._id,
        // Midnight BST at the start of the next business day.
        referenceDate: new Date("2026-07-05T23:00:00.000Z"),
      }),
    ).toBe(1);
  });

  it.each([
    ["customer", "active", "pause"], ["admin", "active", "pause"],
    ["customer", "paused", "resume"], ["admin", "paused", "resume"],
  ])("blocks %s requests on %s scheduled-cancellation records through %s", async (actor, status, action) => {
    const sub = await createBasicSubscription();
    await Subscription.findByIdAndUpdate(sub._id, {
      status, isCancellationScheduled: true,
      cancellationEffectiveAfter: new Date(Date.now() + 2 * 86400000),
    });
    const fields = "status isCancellationScheduled cancellationEffectiveAfter nextDeliveryDate customerVersion pausedAt pausedUntil items deliveryDayPlans";
    const before = await Subscription.findById(sub._id).select(fields).lean();
    const beforePayments = await Payment.find({ subscription: sub._id }).lean();
    const beforeBalance = (await Customer.findById(customer._id)).creditBalance;
    const stripeUpdates = stripe.subscriptions.update.mock.calls.length;
    const charges = stripe.paymentIntents.create.mock.calls.length;
    const refunds = stripe.refunds.create.mock.calls.length;
    let call;
    if (actor === "customer") {
      call = request(app).post(`/api/portal/subscriptions/${sub._id}/${action}`)
        .set("Authorization", `Bearer ${accessToken}`);
    } else {
      const admin = await createUser({ role: "admin" });
      const login = await request(app).post("/api/auth/login").send({ email: admin.email, password: "secret123" });
      call = request(app).post(`/api/admin/subscriptions/${sub._id}/${action}`)
        .set("Cookie", getSetCookieHeader(login));
    }
    const payload = { operationId: crypto.randomUUID(), expectedVersion: before.customerVersion };
    if (action === "pause") Object.assign(payload, {
      resumeOn: new Date(Date.now() + 7 * 86400000), refundMethod: "credit",
    });
    const res = await call.send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Subscription is already scheduled for cancellation");
    expect(await Subscription.findById(sub._id).select(fields).lean()).toEqual(before);
    expect(await Payment.find({ subscription: sub._id }).lean()).toEqual(beforePayments);
    expect((await Customer.findById(customer._id)).creditBalance).toBe(beforeBalance);
    expect(stripe.subscriptions.update.mock.calls).toHaveLength(stripeUpdates);
    expect(stripe.paymentIntents.create.mock.calls).toHaveLength(charges);
    expect(stripe.refunds.create.mock.calls).toHaveLength(refunds);
  });

  it("finalizes a legacy paused cancellation once under overlap and preserves its protected delivery and finances", async () => {
    const sub = await createBasicSubscription();
    const slots = await SubscriptionDelivery.find({ subscription: sub._id }).sort({ scheduledDate: 1 });
    expect(slots.length).toBeGreaterThan(1);
    const protectedSlot = slots[0];
    const futureSlot = slots[1];
    const protectedBefore = await SubscriptionDelivery.findById(protectedSlot._id).lean();
    const protectedEnd = require("../../utils/subscriptionCutoff.util").endOfDayInTimeZone(
      protectedSlot.scheduledDate, SUBSCRIPTION_TIME_ZONE,
    );
    await Subscription.findByIdAndUpdate(sub._id, { status: "paused", isCancellationScheduled: true,
      cancellationEffectiveAfter: protectedSlot.scheduledDate });
    const before = await Subscription.findById(sub._id).lean();
    const beforePayments = await Payment.find({ subscription: sub._id }).lean();
    const beforeBalance = (await Customer.findById(customer._id)).creditBalance;
    const charges = stripe.paymentIntents.create.mock.calls.length;
    const refunds = stripe.refunds.create.mock.calls.length;
    const stripeUpdates = stripe.subscriptions.update.mock.calls.length;
    expect(await subscriptionService.FinalizeScheduledCancellations({ subscriptionId: sub._id,
      referenceDate: new Date(protectedEnd.getTime() - 60000) })).toBe(0);
    const results = await Promise.all([1, 2].map(() => subscriptionService.FinalizeScheduledCancellations({
      subscriptionId: sub._id, referenceDate: new Date(protectedEnd.getTime() + 1),
    })));
    expect(results.reduce((sum, count) => sum + count, 0)).toBe(1);
    const finalized = await Subscription.findById(sub._id).lean();
    expect(finalized.status).toBe("cancelled");
    expect(finalized.isCancellationScheduled).toBe(false);
    expect(finalized.cancellationEffectiveAfter).toBeNull();
    expect(finalized.nextDeliveryDate).toBeNull();
    expect(finalized.customerVersion).toBe(before.customerVersion + 1);
    expect(await SubscriptionDelivery.findById(protectedSlot._id).lean()).toEqual(protectedBefore);
    expect((await SubscriptionDelivery.findById(futureSlot._id)).status).toBe("cancelled");
    expect(await Payment.find({ subscription: sub._id }).lean()).toEqual(beforePayments);
    expect((await Customer.findById(customer._id)).creditBalance).toBe(beforeBalance);
    expect(stripe.paymentIntents.create.mock.calls).toHaveLength(charges);
    expect(stripe.refunds.create.mock.calls).toHaveLength(refunds);
    expect(stripe.subscriptions.update.mock.calls).toHaveLength(stripeUpdates);
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
    expect(cancelNoOrder.status).toBe(200);
    expect(cancelNoOrder.body.data.refundedMinor).toBe(0);

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
    // Keep this safely before the default two-day cut-off even when the suite
    // runs late at night.
    nextDelivery.setDate(nextDelivery.getDate() + 3);
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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

    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        deliveryDays: [0, 1, 2, 3, 4, 5, 6],
        // First delivery cut-off: today at midnight (locked).
        // Second delivery cut-off: tomorrow at midnight (still open).
        cutoffDaysBefore: 1,
        cutoffTime: "00:00",
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
        operationId: crypto.randomUUID(),
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

    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      {
        singletonKey: "subscription-settings",
        deliveryDays: [0, 1, 2, 3, 4, 5, 6],
        // Both cut-offs are at or before today's midnight.
        cutoffDaysBefore: 2,
        cutoffTime: "00:00",
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

  it("validates subscription list pagination query parameters", async () => {
    await createBasicSubscription();

    const invalidPage = await request(app)
      .get("/api/portal/subscriptions?page=0&pageSize=20")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(invalidPage.status).toBe(400);
    expect(invalidPage.body.message).toMatch(/page/i);

    const invalidPageSize = await request(app)
      .get("/api/portal/subscriptions?page=1&pageSize=101")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(invalidPageSize.status).toBe(400);
    expect(invalidPageSize.body.message).toMatch(/pageSize/i);
  });

  it("loads only the earliest upcoming date per subscription with one aggregate query", async () => {
    const first = await createBasicSubscription();
    const second = await createBasicSubscription();

    await SubscriptionDelivery.deleteMany({
      subscription: { $in: [first._id, second._id] },
    });

    const firstUpcoming = new Date();
    firstUpcoming.setDate(firstUpcoming.getDate() + 1);
    firstUpcoming.setHours(9, 0, 0, 0);

    const secondUpcoming = new Date();
    secondUpcoming.setDate(secondUpcoming.getDate() + 2);
    secondUpcoming.setHours(9, 0, 0, 0);

    const firstLater = new Date();
    firstLater.setDate(firstLater.getDate() + 8);
    firstLater.setHours(9, 0, 0, 0);

    await SubscriptionDelivery.create([
      {
        subscription: first._id,
        customer: customer._id,
        scheduledDate: firstUpcoming,
        status: "scheduled",
      },
      {
        subscription: first._id,
        customer: customer._id,
        scheduledDate: firstLater,
        status: "generated",
      },
      {
        subscription: second._id,
        customer: customer._id,
        scheduledDate: secondUpcoming,
        status: "generated",
      },
    ]);

    const aggregateSpy = jest.spyOn(SubscriptionDelivery, "aggregate");

    const listRes = await request(app)
      .get("/api/portal/subscriptions?page=1&pageSize=20")
      .set("Authorization", `Bearer ${accessToken}`);

    const aggregateCalls = aggregateSpy.mock.calls.length;
    const pipeline = aggregateSpy.mock.calls[0]?.[0] || [];
    aggregateSpy.mockRestore();

    expect(listRes.status).toBe(200);
    expect(aggregateCalls).toBe(1);
    expect(
      pipeline.some(
        (stage) => stage?.$group?.scheduledDate?.$min === "$scheduledDate",
      ),
    ).toBe(true);

    const firstListed = listRes.body.data.subscriptions.find(
      (subscription) => subscription._id === first._id.toString(),
    );
    const secondListed = listRes.body.data.subscriptions.find(
      (subscription) => subscription._id === second._id.toString(),
    );

    expect(new Date(firstListed.upcomingDeliveryDate).toISOString()).toBe(
      firstUpcoming.toISOString(),
    );
    expect(new Date(secondListed.upcomingDeliveryDate).toISOString()).toBe(
      secondUpcoming.toISOString(),
    );
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
    const expectedCutoff = computeSubscriptionCutoffDate(
      upcomingDelivery,
      {
        cutoffDaysBefore: res.body.data.cutoff.cutoffDaysBefore,
        cutoffTime: res.body.data.cutoff.cutoffTime,
      },
      "Europe/London",
    );

    expect(res.body.data.cutoff.timeZone).toBe("Europe/London");
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

    await Customer.updateOne(
      { _id: customer._id, "addresses._id": addressId },
      { $set: { "addresses.$.line1": "2 Before Cutoff Street" } },
    );
    const beforeRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ deliveryAddressId: addressId });
    expect(beforeRes.status).toBe(200);
    const beforeStored = await Subscription.findById(sub._id).lean();
    expect(beforeStored.deliveryAddress.line1).toBe("2 Before Cutoff Street");
    expect(beforeStored.pendingChanges?.deliveryAddress).toBeFalsy();
    await Customer.updateOne(
      { _id: customer._id, "addresses._id": addressId },
      { $set: { "addresses.$.line1": "3 After Cutoff Street" } },
    );

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
    expect(stored.deliveryAddress.line1).toBe("2 Before Cutoff Street");
    expect(stored.pendingChanges.deliveryAddress.line1).toBe("3 After Cutoff Street");
    expect(new Date(stored.pendingChanges.effectiveFrom).getTime())
      .toBeGreaterThan(deliveryInThreeDays.getTime());
  });

  it("multi-day create rejects invalid deliveryDayPlans and supports defaults", async () => {
    const { variant: secondVariant } = await createTestProduct();

    const badUnselected = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
      .spyOn(subscriptionClock, "now")
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
        operationId: crypto.randomUUID(),
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
      .spyOn(subscriptionClock, "now")
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
        operationId: crypto.randomUUID(),
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
      .spyOn(subscriptionClock, "now")
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
        operationId: crypto.randomUUID(),
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
    expect(stripe.prices.create.mock.calls.at(-1)?.[0]?.unit_amount).toBe(950);
    nowSpy.mockRestore();
  });

  it.each([false, true])("portal reduction to one day preserves products and refunds the removed day (staged=%s)", async (staged) => {
    const openCutoffNow = new Date("2026-07-06T08:00:00.000Z");
    const nowSpy = jest
      .spyOn(subscriptionClock, "now")
      .mockReturnValue(openCutoffNow.getTime());

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

    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
        frequency: "weekly",
        preferredDeliveryDays: [0, 3],
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        deliveryDayPlans: [0, 3].map(day => ({ day, items: [{ variantId, quantity: 1 }] })),
      });
    expect(createRes.status).toBe(201);

    const sub = createRes.body.data.subscription;
    expect(sub.items[0].quantity).toBe(2);
    if (staged) {
      await Subscription.updateOne({ _id: sub._id }, { $set: { pendingChanges: {
        items: [{ ...sub.items[0], quantity: 5 }],
        deliveryDayPlans: [
          { day: 0, items: [{ ...sub.items[0], quantity: 3 }] },
          { day: 3, items: [{ ...sub.items[0], quantity: 2 }] },
        ],
        preferredDeliveryDays: [0, 3],
        effectiveFrom: new Date("2026-07-15T12:00:00.000Z"),
      } } });
    }

    const nextSunday = new Date("2026-07-12T12:00:00.000Z");
    const nextWednesday = new Date("2026-07-08T12:00:00.000Z");

    const sundayOrder = await Order.create({
      customer: customer._id,
      items: [
        {
          product: sub.items[0].product,
          variant: sub.items[0].variant,
          name: sub.items[0].name,
          sku: sub.items[0].sku,
          price: sub.items[0].unitPrice,
          quantity: 1,
          subtotal: sub.items[0].unitPrice,
        },
      ],
      deliveryAddress: {
        line1: "1 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
      },
      customerInstructions: "",
      location: { lat: 51.5, lng: -0.1 },
      deliveryDate: nextSunday,
      deliveryFee: 1,
      subtotal: 2.5,
      total: 3.5,
      amountPaid: 3.5,
      status: "paid",
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      orderType: "subscription_generated",
      subscription: sub._id,
      stripePaymentIntentId: `pi_paid_${crypto.randomUUID().slice(0, 8)}`,
      paidAt: new Date(),
    });

    await Order.create({
      customer: customer._id,
      items: [
        {
          product: sub.items[0].product,
          variant: sub.items[0].variant,
          name: sub.items[0].name,
          sku: sub.items[0].sku,
          price: sub.items[0].unitPrice,
          quantity: 1,
          subtotal: sub.items[0].unitPrice,
        },
      ],
      deliveryAddress: {
        line1: "1 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
      },
      customerInstructions: "",
      location: { lat: 51.5, lng: -0.1 },
      deliveryDate: nextWednesday,
      deliveryFee: 1,
      subtotal: 2.5,
      total: 3.5,
      amountPaid: 3.5,
      status: "paid",
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      orderType: "subscription_generated",
      subscription: sub._id,
      stripePaymentIntentId: `pi_paid_${crypto.randomUUID().slice(0, 8)}`,
      paidAt: new Date(),
    });

    const updateRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        preferredDeliveryDay: 3,
        preferredDeliveryDays: [3],
        deliveryDayPlans: [{ day: 3, items: [{ variantId, quantity: staged ? 2 : 1 }] }],
        deliveryAddressId: addressId,
        refundMethod: "refund",
      });

    expect(updateRes.status).toBe(200);
    expect(
      (updateRes.body.data.refundedMinor || 0) +
        (updateRes.body.data.creditedMinor || 0),
    ).toBe(350);

    const refreshedSundayOrder = await Order.findById(sundayOrder._id).lean();
    expect(refreshedSundayOrder.status).toBe("refunded");

    const updated = await Subscription.findById(sub._id).lean();
    expect(updated.items[0].quantity).toBe(1);
    expect(updated.deliveryDayPlans || []).toHaveLength(0);
    expect(updated.preferredDeliveryDays).toEqual([3]);
    if (staged) {
      expect(updated.pendingChanges.items[0].quantity).toBe(2);
      expect(updated.pendingChanges.deliveryDayPlans).toEqual([]);
      expect(updated.pendingChanges.preferredDeliveryDays).toEqual([3]);
    }
    nowSpy.mockRestore();
  });

  it("charges only the open-day delta immediately when a staged locked-day plan already exists", async () => {
    const mixedCutoffNow = new Date("2026-07-07T12:00:00.000Z");
    const nowSpy = jest
      .spyOn(subscriptionClock, "now")
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
        operationId: crypto.randomUUID(),
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
      .spyOn(subscriptionClock, "now")
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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
    // Remain safely ahead of the default two-day cut-off at every run time.
    slotDate.setDate(slotDate.getDate() + 3);
    slotDate.setHours(9, 0, 0, 0);

    await Subscription.findByIdAndUpdate(subWithSlot._id, {
      status: "paused",
      pausedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      nextDeliveryDate: null,
    });
    // createBasicSubscription pre-generates delivery slots. Isolate this case
    // so the explicitly retained slot below is the first eligible one.
    await SubscriptionDelivery.deleteMany({ subscription: subWithSlot._id });
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

    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      { cutoffDaysBefore: 2, cutoffTime: "22:00" },
    );
    // These are separate user actions. Reusing the legacy payload-derived key
    // would replay the no-op after the saved customer address is edited.
    const unchangedRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ deliveryAddressId: knownAddressId, operationId: crypto.randomUUID() });
    expect(unchangedRes.status).toBe(200);
    const unchangedStored = await Subscription.findById(sub._id).lean();
    expect(unchangedStored.pendingChanges?.deliveryAddress).toBeFalsy();

    await Customer.updateOne(
      { _id: customer._id, "addresses._id": knownAddressId },
      { $set: { "addresses.$.line1": "4 Future Delivery Street" } },
    );
    const afterRes = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ deliveryAddressId: knownAddressId, operationId: crypto.randomUUID() });
    expect(afterRes.status).toBe(200);
    const afterStored = await Subscription.findById(sub._id).lean();
    expect(afterStored.deliveryAddress.line1).toBe(sub.deliveryAddress.line1);
    expect(afterStored.pendingChanges.deliveryAddress.line1).toBe("4 Future Delivery Street");
    expect(new Date(afterStored.pendingChanges.effectiveFrom).getTime())
      .toBeGreaterThan(tomorrow.getTime());

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

    const afterWeekday = weekdayInTimeZone(
      after.nextDeliveryDate,
      SUBSCRIPTION_TIME_ZONE,
    );
    expect(afterWeekday).toBe(3);
    expect(new Date(after.nextDeliveryDate).getTime()).not.toBe(
      new Date(before.nextDeliveryDate).getTime(),
    );
  });

  it("does not move paid orders when unchanged delivery-day fields are resubmitted", async () => {
    const sub = await createBasicSubscription();
    const farSunday = new Date("2026-10-04T09:00:00.000Z");
    await Subscription.findByIdAndUpdate(sub._id, {
      nextDeliveryDate: farSunday,
      preferredDeliveryDay: 0,
      preferredDeliveryDays: [0],
    });
    const item = sub.items[0];
    const order = await Order.create({
      customer: customer._id,
      items: [
        {
          product: item.product,
          variant: item.variant,
          name: item.name,
          sku: item.sku,
          price: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.unitPrice * item.quantity,
        },
      ],
      deliveryAddress: sub.deliveryAddress,
      location: { lat: 51.5, lng: -0.1 },
      deliveryDate: farSunday,
      deliveryFee: 1,
      subtotal: item.unitPrice * item.quantity,
      total: item.unitPrice * item.quantity + 1,
      amountPaid: item.unitPrice * item.quantity + 1,
      status: "paid",
      deliveryStatus: "ordered",
      orderType: "subscription_generated",
      subscription: sub._id,
      reservationExpiresAt: new Date("2026-10-05T09:00:00.000Z"),
    });

    const res = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ preferredDeliveryDay: 0, preferredDeliveryDays: [0] });

    expect(res.status).toBe(200);
    const [storedSubscription, storedOrder] = await Promise.all([
      Subscription.findById(sub._id).lean(),
      Order.findById(order._id).lean(),
    ]);
    expect(new Date(storedSubscription.nextDeliveryDate).toISOString()).toBe(
      farSunday.toISOString(),
    );
    expect(new Date(storedOrder.deliveryDate).toISOString()).toBe(
      farSunday.toISOString(),
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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

    if (updateRes.status !== 200) {
      throw new Error(
        `Card decrease failed with ${updateRes.status}: ${JSON.stringify(updateRes.body)}; errors: ${(console.error.mock?.calls || []).map(args => args.map(arg => arg?.stack || String(arg)).join(" ")).join("\n")}`,
      );
    }
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
        operationId: crypto.randomUUID(),
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
        operationId: crypto.randomUUID(),
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

    const londonClock = zonedParts(cutoffAt, "Europe/London");
    const hh = String(londonClock.hour).padStart(2, "0");
    const mm = String(londonClock.minute).padStart(2, "0");
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

    const nowSpy = jest.spyOn(subscriptionClock, "now").mockReturnValue(cutoffAt.getTime());

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

    const londonClock = zonedParts(cutoffAt, "Europe/London");
    const hh = String(londonClock.hour).padStart(2, "0");
    const mm = String(londonClock.minute).padStart(2, "0");
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
      .spyOn(subscriptionClock, "now")
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

    const londonClock = zonedParts(cutoffAt, "Europe/London");
    const hh = String(londonClock.hour).padStart(2, "0");
    const mm = String(londonClock.minute).padStart(2, "0");
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
    const nowSpy = jest.spyOn(subscriptionClock, "now").mockReturnValue(cutoffPlusOneMinute);

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

  it("replays a paid add-on after its delivery closes and rejects changed retry contents", async () => {
    const sub = await createBasicSubscription();
    const deliveries = await prepareUpcomingDeliveries(sub._id);
    const operationId = crypto.randomUUID();
    const payload = { operationId, items: [{ variantId, quantity: 1 }] };
    const send = body => request(app)
      .post(`/api/portal/subscriptions/${sub._id}/next-delivery/add-ons`)
      .set("Authorization", `Bearer ${accessToken}`).send(body);
    stripe.paymentIntents.create.mockClear();
    const first = await send(payload);
    expect(first.status).toBe(200);
    await SubscriptionDelivery.findByIdAndUpdate(deliveries[0]._id, {
      scheduledDate: new Date(Date.now() - 86400000),
    });
    const retry = await send(payload);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    const conflict = await send({ ...payload, items: [{ variantId, quantity: 2 }] });
    expect(conflict.status).toBe(409);
    expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    const later = await SubscriptionDelivery.findById(deliveries[1]._id).lean();
    expect(later.addOns).toHaveLength(0);
  });

  it("blocks conflicting actions while an add-on outcome is unknown but allows its original retry", async () => {
    const sub = await createBasicSubscription();
    await prepareUpcomingDeliveries(sub._id);
    const payload = { operationId: crypto.randomUUID(), items: [{ variantId, quantity: 1 }] };
    const addOn = body => request(app).post(`/api/portal/subscriptions/${sub._id}/next-delivery/add-ons`)
      .set("Authorization", `Bearer ${accessToken}`).send(body);
    stripe.paymentIntents.create.mockClear();
    stripe.paymentIntents.create.mockRejectedValueOnce(new Error("response lost"));
    expect((await addOn(payload)).status).toBe(400);
    for (const action of ["pause", "cancel"]) {
      const result = await request(app).post(`/api/portal/subscriptions/${sub._id}/${action}`)
        .set("Authorization", `Bearer ${accessToken}`).send({ operationId: crypto.randomUUID() });
      expect(result.status).toBe(409);
      expect(result.body.message).toMatch(/earlier payment/);
    }
    const edit = await request(app).patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`).send({ notes: "Blocked edit", operationId: crypto.randomUUID() });
    expect(edit.status).toBe(409);
    expect((await addOn({ ...payload, operationId: crypto.randomUUID() })).status).toBe(409);
    expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    expect((await Subscription.findById(sub._id)).status).toBe("active");
    expect((await addOn(payload)).status).toBe(200);
    expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(2);
    expect(stripe.paymentIntents.create.mock.calls[1]).toEqual(stripe.paymentIntents.create.mock.calls[0]);
    const after = await request(app).patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`).send({ notes: "Allowed after recovery", operationId: crypto.randomUUID() });
    expect(after.status).toBe(200);
  });

  it("does not lock a subscription after a confirmed unpaid add-on decline", async () => {
    const sub = await createBasicSubscription();
    await prepareUpcomingDeliveries(sub._id);
    stripe.paymentIntents.create.mockRejectedValueOnce({ message: "declined", payment_intent: {
      id: "pi_unpaid_decline", status: "requires_payment_method", amount_received: 0,
    } });
    const first = await request(app).post(`/api/portal/subscriptions/${sub._id}/next-delivery/add-ons`)
      .set("Authorization", `Bearer ${accessToken}`).send({ operationId: crypto.randomUUID(), items: [{ variantId, quantity: 1 }] });
    expect(first.status).toBe(400);
    expect(first.body.data.paymentOutcome).toBe("declined");
    const edit = await request(app).patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`).send({ notes: "Allowed after decline", operationId: crypto.randomUUID() });
    expect(edit.status).toBe(200);
  });

  it("keeps an ambiguous add-on payment bound to its original delivery after cutoff", async () => {
    const sub = await createBasicSubscription();
    const deliveries = await prepareUpcomingDeliveries(sub._id);
    const payload = { operationId: crypto.randomUUID(), items: [{ variantId, quantity: 1 }] };
    const send = () => request(app)
      .post(`/api/portal/subscriptions/${sub._id}/next-delivery/add-ons`)
      .set("Authorization", `Bearer ${accessToken}`).send(payload);
    stripe.paymentIntents.create.mockClear();
    stripe.paymentIntents.create.mockRejectedValueOnce(new Error("response lost"));
    const first = await send();
    expect(first.status).toBe(400);
    expect(first.body.data.paymentOutcome).toBe("unknown");
    await SubscriptionDelivery.findByIdAndUpdate(deliveries[0]._id, {
      scheduledDate: new Date(Date.now() - 86400000),
    });
    const retry = await send();
    expect(retry.status).toBe(400);
    expect(retry.body.message).toMatch(/original add-on delivery/);
    expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    const later = await SubscriptionDelivery.findById(deliveries[1]._id).lean();
    expect(later.addOns).toHaveLength(0);
  });

  it.each(["dispatch", "order-write-failure"])("keeps a paid add-on recoverable when %s wins before fulfillment", async failure => {
    const sub = await createBasicSubscription();
    const deliveries = await prepareUpcomingDeliveries(sub._id);
    const order = await createPaidOrderFor(sub);
    order.deliveryDate = deliveries[0].scheduledDate;
    await order.save();
    await SubscriptionDelivery.findByIdAndUpdate(deliveries[0]._id, { order: order._id, status: "generated" });
    const originalItems = order.items.map(item => item.toObject());
    const payload = { operationId: crypto.randomUUID(), items: [{ variantId, quantity: 1 }] };
    const send = () => request(app).post(`/api/portal/subscriptions/${sub._id}/next-delivery/add-ons`)
      .set("Authorization", `Bearer ${accessToken}`).send(payload);
    stripe.paymentIntents.create.mockClear();
    stripe.refunds.create.mockClear();
    const originalRetrieve = stripe.paymentIntents.retrieve.getMockImplementation();
    stripe.paymentIntents.retrieve.mockImplementation(async id => id === `pi_fulfillment_${payload.operationId}`
      ? { id, status: "succeeded", amount_received: 250, customer: customer.stripeCustomerId, currency: "gbp" } : originalRetrieve(id));
    stripe.paymentIntents.create.mockImplementationOnce(async params => {
      if (failure === "dispatch") await Order.updateOne({ _id: order._id }, { $set: { deliveryStatus: "dispatched" } });
      return { ...params, id: `pi_fulfillment_${payload.operationId}`, status: "succeeded", amount_received: 250 };
    });
    const write = failure === "order-write-failure" ? jest.spyOn(Order.prototype, "save")
      .mockRejectedValueOnce(new Error("Injected add-on order write failure")) : null;
    let first;
    try { first = await send(); } finally { write?.mockRestore(); }
    expect(first.status).toBe(failure === "dispatch" ? 200 : 500);
    if (failure === "dispatch") expect(first.body.data).toMatchObject({ paymentOutcome: "refunded", refundedMinor: 250 });
    expect((await SubscriptionDelivery.findById(deliveries[0]._id)).addOns).toHaveLength(0);
    expect((await Order.findById(order._id)).items.map(item => item.toObject())).toEqual(originalItems);
    expect(await Payment.countDocuments({ providerReference: `pi_fulfillment_${payload.operationId}` })).toBe(1);
    const retry = await send();
    expect(retry.status).toBe(200);
    expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    expect((await SubscriptionDelivery.findById(deliveries[0]._id)).addOns).toHaveLength(failure === "dispatch" ? 0 : 1);
    if (failure === "dispatch") {
      expect(retry.body.data.paymentOutcome).toBe("refunded");
      expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
      expect((await Payment.findOne({ providerReference: `pi_fulfillment_${payload.operationId}` })).status).toBe("refunded");
    }
  });

  it("charges only one of two concurrent subscriptions purchasing the last add-on unit", async () => {
    const first = await createBasicSubscription();
    const second = await createBasicSubscription();
    await prepareUpcomingDeliveries(first._id);
    await prepareUpcomingDeliveries(second._id);
    const { variant } = await createTestProduct();
    await ProductVariant.updateOne({ _id: variant._id }, { $set: { stockQuantity: 1, reservedQuantity: 0 } });
    stripe.paymentIntents.create.mockClear();
    const send = sub => request(app).post(`/api/portal/subscriptions/${sub._id}/next-delivery/add-ons`)
      .set("Authorization", `Bearer ${accessToken}`).send({ operationId: crypto.randomUUID(),
        items: [{ variantId: String(variant._id), quantity: 1 }] });
    const results = await Promise.all([send(first), send(second)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 400]);
    expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    const saved = await ProductVariant.findById(variant._id);
    expect(saved.stockQuantity).toBe(0);
    expect(saved.reservedQuantity).toBe(0);
  });

  it("charges a one-time item for only the next scheduled delivery", async () => {
    const sub = await createBasicSubscription();
    const deliveries = await prepareUpcomingDeliveries(sub._id);
    const { variant: addOnVariant } = await createTestProduct();
    const recurringBefore = await Subscription.findById(sub._id).lean();
    const operationId = crypto.randomUUID();

    stripe.paymentIntents.create.mockClear();
    stripe.prices.create.mockClear();
    stripe.subscriptions.update.mockClear();

    const res = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/next-delivery/add-ons`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId,
        items: [{ variantId: addOnVariant._id.toString(), quantity: 2 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.chargedMinor).toBe(500);
    expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 500,
        confirm: true,
        off_session: true,
        metadata: expect.objectContaining({
          type: "delivery_add_on",
          operationId,
          subscriptionDeliveryId: deliveries[0]._id.toString(),
        }),
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringContaining(operationId),
      }),
    );

    const storedDeliveries = await SubscriptionDelivery.find({
      subscription: sub._id,
    }).sort({ scheduledDate: 1 });
    expect(storedDeliveries[0].addOns).toHaveLength(1);
    expect(storedDeliveries[0].addOns[0].items[0].quantity).toBe(2);
    expect(storedDeliveries.slice(1).every((delivery) => !delivery.addOns.length)).toBe(
      true,
    );

    const recurringAfter = await Subscription.findById(sub._id).lean();
    expect(recurringAfter.items.map((item) => item.toObject?.() || item)).toEqual(
      recurringBefore.items.map((item) => item.toObject?.() || item),
    );
    expect(stripe.prices.create).not.toHaveBeenCalled();
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();

    const payment = await Payment.findOne({
      subscription: sub._id,
      providerReference: storedDeliveries[0].addOns[0].stripePaymentIntentId,
    }).lean();
    expect(payment).toMatchObject({ amount: 5, status: "paid", order: null });
  });

  it.each(["single-day", "multi-day"])("preserves a paid add-on through recurring edits (%s)", async (mode) => {
    const sub = await createBasicSubscription();
    const deliveries = await prepareUpcomingDeliveries(sub._id);
    const storedSub = await Subscription.findById(sub._id).lean();
    const recurringSubtotal = storedSub.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    const order = await Order.create({
      customer: customer._id,
      items: storedSub.items.map((item) => ({
        product: item.product,
        variant: item.variant,
        name: item.name,
        sku: item.sku,
        price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
      })),
      deliveryAddress: storedSub.deliveryAddress,
      customerInstructions: "",
      location: { lat: 51.5, lng: -0.1 },
      deliveryDate: deliveries[0].scheduledDate,
      deliveryFee: 0,
      subtotal: recurringSubtotal,
      total: recurringSubtotal,
      amountPaid: recurringSubtotal,
      status: "paid",
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      orderType: "subscription_generated",
      subscription: sub._id,
      stripePaymentIntentId: `pi_subscription_${crypto.randomUUID()}`,
      paidAt: new Date(),
    });
    deliveries[0].order = order._id;
    deliveries[0].status = "generated";
    deliveries[0].generatedAt = new Date();
    await deliveries[0].save();

    const { variant: addOnVariant } = await createTestProduct();
    const operationId = crypto.randomUUID();
    stripe.paymentIntents.create.mockClear();
    const payload = {
      operationId,
      items: [{ variantId: addOnVariant._id.toString(), quantity: 1 }],
    };

    const first = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/next-delivery/add-ons`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);
    const retry = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/next-delivery/add-ons`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);

    const updatedOrder = await Order.findById(order._id).lean();
    expect(updatedOrder.items.filter((item) => item.isSubscriptionAddOn)).toHaveLength(
      1,
    );
    expect(updatedOrder.subtotal).toBe(recurringSubtotal + 2.5);
    expect(updatedOrder.total).toBe(recurringSubtotal + 2.5);
    expect(updatedOrder.amountPaid).toBe(recurringSubtotal + 2.5);
    expect(
      updatedOrder.paymentAllocations.filter(
        (allocation) => allocation.source === "delivery_add_on",
      ),
    ).toHaveLength(1);

    const addOnPayment = await Payment.findOne({
      subscription: sub._id,
      order: order._id,
    }).lean();
    expect(addOnPayment).toMatchObject({ amount: 2.5, status: "paid" });

    const paidAddOns = updatedOrder.items.filter(item => item.isSubscriptionAddOn);
    const allocation = updatedOrder.paymentAllocations.find(a => a.source === "delivery_add_on");
    const day = deliveries[0].scheduledDate.getUTCDay();
    const otherDay = (day + 3) % 7;
    if (mode === "multi-day") {
      await Subscription.findByIdAndUpdate(sub._id, {
        preferredDeliveryDay: day, preferredDeliveryDays: [day, otherDay],
        deliveryDayPlans: [day, otherDay].map(day => ({ day, items: storedSub.items })),
        items: storedSub.items.map(item => ({ ...item, quantity: item.quantity * 2 })),
      });
    }
    // Increase, decrease, then repeat a no-price-change edit. None may remove
    // or recharge the independently purchased add-on.
    for (const quantity of [2, 1, 1]) {
      const mutation = mode === "single-day"
        ? request(app).put(`/api/portal/subscriptions/${sub._id}/items`)
        : request(app).patch(`/api/portal/subscriptions/${sub._id}`);
      const body = mode === "single-day"
        ? { items: [{ itemId: storedSub.items[0]._id, quantity }] }
        : { changedDeliveryDays: [day], deliveryDayPlans: [
            { day, items: [{ variantId, quantity }] },
            { day: otherDay, items: [{ variantId, quantity: 1 }] },
          ] };
      const edited = await mutation.set("Authorization", `Bearer ${accessToken}`)
        .send({ ...body, operationId: crypto.randomUUID(), refundMethod: "credit" });
      expect(edited.status).toBe(200);
      const fulfilled = await Order.findById(order._id).lean();
      expect(fulfilled.items.filter(item => item.isSubscriptionAddOn)).toEqual(paidAddOns);
      expect(fulfilled.items.filter(item => !item.isSubscriptionAddOn)[0].quantity).toBe(quantity);
      expect(fulfilled.total).toBe(quantity * 2.5 + 2.5);
      expect(fulfilled.paymentAllocations.filter(a => a.source === "delivery_add_on")).toEqual([allocation]);
      const plan = await Subscription.findById(sub._id).lean();
      expect(plan.items.some(item => String(item.variant) === String(addOnVariant._id))).toBe(false);
    }
    // One add-on purchase and one recurring increase; no extra add-on charge.
    expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(2);

  });

  it("rejects a next-delivery add-on after its cut-off without charging", async () => {
    const sub = await createBasicSubscription();
    await prepareUpcomingDeliveries(sub._id);
    const { variant: addOnVariant } = await createTestProduct();
    await SubscriptionSettings.findOneAndUpdate(
      { singletonKey: "subscription-settings" },
      { cutoffDaysBefore: 30, cutoffTime: "00:00" },
    );
    stripe.paymentIntents.create.mockClear();

    const res = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/next-delivery/add-ons`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
        items: [{ variantId: addOnVariant._id.toString(), quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cut-off/i);
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(await Payment.countDocuments({ subscription: sub._id })).toBe(0);
  });

  it("blocks store credit when the requested card refund outcome is unknown", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
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

    expect(updateRes.status).toBe(400);
    expect(updateRes.body.data.refundPending).toBe(true);
    expect((await Subscription.findById(sub._id)).items[0].quantity).toBe(3);

    const refreshedCustomer = await Customer.findById(customer._id).lean();
    expect(refreshedCustomer.creditBalance).toBe(0);

    const creditTx = await StoreCreditTransaction.findOne({
      customer: customer._id,
      type: "subscription_refund",
    }).lean();
    expect(creditTx).toBeNull();
  });

  it.each(["lost-response", "pending", "local-write"])("recovers a decrease card refund without duplicate credit or a new target (%s)", async boundary => {
    await SubscriptionSettings.findOneAndUpdate({ singletonKey: "subscription-settings" },
      { cutoffDaysBefore: 0, cutoffTime: "23:59" }, { upsert: true });
    const create = await request(app).post("/api/portal/subscriptions").set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(), frequency: "weekly", preferredDeliveryDay: 0, deliveryAddressId: addressId, items: [{ variantId, quantity: 3 }] });
    expect(create.status).toBe(201);
    const sub = create.body.data.subscription;
    const order = await createPaidOrderFor(sub);
    const payload = { operationId: crypto.randomUUID(), quantity: 1, refundMethod: "refund" };
    const send = () => request(app).patch(`/api/portal/subscriptions/${sub._id}/items/${sub.items[0]._id}`)
      .set("Authorization", `Bearer ${accessToken}`).send(payload);
    const originalRetrieve = stripe.refunds.retrieve.getMockImplementation();
    let fail;
    try {
      stripe.refunds.create.mockClear();
      stripe.refunds.retrieve.mockImplementation(async id => ({ id, status: "succeeded", amount: 500 }));
      if (boundary === "lost-response") stripe.refunds.create.mockRejectedValueOnce(new Error("accepted response lost"));
      if (boundary === "pending") stripe.refunds.create.mockResolvedValueOnce({ id: "re_pending_decrease", status: "pending", amount: 500 });
      if (boundary === "local-write") fail = jest.spyOn(Order.prototype, "save").mockRejectedValueOnce(new Error("fulfillment unavailable"));
      expect((await send()).status).toBe(boundary === "local-write" ? 500 : 400);
      fail?.mockRestore();
      expect((await Customer.findById(customer._id)).creditBalance).toBe(0);
      expect((await Subscription.findById(sub._id)).items[0].quantity).toBe(3);
      const conflicting = await request(app).patch(`/api/portal/subscriptions/${sub._id}`)
        .set("Authorization", `Bearer ${accessToken}`).send({ operationId: crypto.randomUUID(), notes: "new edit" });
      expect(conflicting.status).toBe(409);
      const completed = await send();
      expect(completed.status).toBe(200);
      expect(completed.body.data.refundedMinor).toBe(500);
      expect((await Customer.findById(customer._id)).creditBalance).toBe(0);
      expect((await Order.findById(order._id)).items[0].quantity).toBe(1);
      expect(stripe.refunds.create).toHaveBeenCalledTimes(boundary === "lost-response" ? 2 : 1);
      if (boundary === "lost-response") expect(stripe.refunds.create.mock.calls[0]).toEqual(stripe.refunds.create.mock.calls[1]);
      expect((await send()).status).toBe(200);
      expect(stripe.refunds.create).toHaveBeenCalledTimes(boundary === "lost-response" ? 2 : 1);
    } finally { fail?.mockRestore(); stripe.refunds.retrieve.mockImplementation(originalRetrieve); }
  });

  it("replaces single-day product edits in one mutation and settles only the net decrease", async () => {
    const { variant: secondVariant } = await createTestProduct();
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [
          { variantId, quantity: 2 },
          { variantId: secondVariant._id.toString(), quantity: 1 },
        ],
      });

    expect(createRes.status).toBe(201);
    const subscription = createRes.body.data.subscription;
    await prepareUpcomingDeliveries(subscription._id);

    const primaryItem = subscription.items.find(
      (item) => String(item.variant) === String(variantId),
    );
    expect(primaryItem).toBeTruthy();

    stripe.paymentIntents.create.mockClear();

    const replaceRes = await request(app)
      .put(`/api/portal/subscriptions/${subscription._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        items: [{ itemId: primaryItem._id, quantity: 1 }],
        refundMethod: "credit",
      });

    expect(replaceRes.status).toBe(200);
    expect(replaceRes.body.data.subscription.items).toHaveLength(1);
    expect(replaceRes.body.data.subscription.items[0].quantity).toBe(1);
    expect(replaceRes.body.data.creditedMinor).toBe(500);
    expect(replaceRes.body.data.refundedMinor).toBe(0);
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();

    const saved = await Subscription.findById(subscription._id).lean();
    expect(saved.items).toHaveLength(1);
    expect(String(saved.items[0].variant)).toBe(String(variantId));
    expect(saved.items[0].quantity).toBe(1);
  });

  async function createPaidOrderFor(sub) {
    const total = sub.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    return Order.create({
      customer: customer._id,
      items: sub.items.map((item) => ({
        product: item.product, variant: item.variant, name: item.name, sku: item.sku,
        price: item.unitPrice, quantity: item.quantity, subtotal: item.unitPrice * item.quantity,
      })),
      deliveryAddress: sub.deliveryAddress,
      location: { lat: 51.5, lng: -0.1 },
      deliveryDate: sub.nextDeliveryDate,
      subtotal: total, total, amountPaid: total,
      status: "paid", deliveryStatus: "ordered",
      reservationExpiresAt: new Date(Date.now() + 86400000),
      orderType: "subscription_generated", subscription: sub._id,
      stripePaymentIntentId: `pi_${crypto.randomUUID()}`, paidAt: new Date(),
    });
  }

  it.each(["pause", "cancel", "remove-day"].flatMap(action => ["credit", "refund"].map(method => [action, method])))(
    "settles a paid add-on with no order exactly once when %s uses %s, including a failed local commit", async (action, method) => {
      const sub = await createBasicSubscription();
      const deliveries = await prepareUpcomingDeliveries(sub._id);
      const { variant } = await createTestProduct();
      const addOnOperation = crypto.randomUUID();
      const purchased = await request(app).post(`/api/portal/subscriptions/${sub._id}/next-delivery/add-ons`)
        .set("Authorization", `Bearer ${accessToken}`).send({ operationId: addOnOperation,
          items: [{ variantId: String(variant._id), quantity: 1 }] });
      expect(purchased.status).toBe(200);
      expect(purchased.body.data.order).toBeNull();
      const mutation = await require("../../models/subscriptionMutation.model").findOne({ operationId: addOnOperation }).lean();
      const intent = mutation.addOnSnapshot.paymentIntent;
      const originalRetrieve = stripe.paymentIntents.retrieve.getMockImplementation();
      const originalRefundRetrieve = stripe.refunds.retrieve.getMockImplementation();
      let fail;
      try {
        stripe.paymentIntents.retrieve.mockImplementation(async id => id === intent.id ? {
          ...intent, customer: mutation.addOnSnapshot.chargeParams.customer, currency: "gbp", amount_received: 250,
        } : originalRetrieve(id));
        stripe.refunds.retrieve.mockImplementation(async id => ({ id, amount: 250, status: "succeeded" }));
        const payload = { operationId: crypto.randomUUID(), refundMethod: method };
        if (action === "pause") payload.resumeOn = new Date(Date.now() + 21 * 86400000).toISOString();
        if (action === "remove-day") {
          const target = (weekdayInTimeZone(deliveries[0].scheduledDate, SUBSCRIPTION_TIME_ZONE) + 1) % 7;
          payload.preferredDeliveryDay = target;
          payload.preferredDeliveryDays = [target];
        }
        const send = () => (action === "remove-day"
          ? request(app).patch(`/api/portal/subscriptions/${sub._id}`)
          : request(app).post(`/api/portal/subscriptions/${sub._id}/${action}`))
          .set("Authorization", `Bearer ${accessToken}`).send(payload);
        stripe.refunds.create.mockClear();
        fail = jest.spyOn(Payment, "updateOne").mockRejectedValueOnce(new Error("settlement ledger unavailable"));
        expect((await send()).status).toBe(400);
        fail.mockRestore();
        expect((await Subscription.findById(sub._id)).status).toBe("active");
        expect((await SubscriptionDelivery.findById(deliveries[0]._id)).addOns).toHaveLength(1);
        expect((await Payment.findOne({ providerReference: intent.id })).status).toBe("paid");
        const conflict = await request(app).patch(`/api/portal/subscriptions/${sub._id}`)
          .set("Authorization", `Bearer ${accessToken}`).send({ operationId: crypto.randomUUID(), notes: "conflicting edit" });
        expect(conflict.status).toBe(409);
        const retried = await send();
        expect(retried.status).toBe(200);
        expect(retried.body.data[method === "credit" ? "creditedMinor" : "refundedMinor"]).toBe(250);
        expect((await Payment.findOne({ providerReference: intent.id })).status).toBe("refunded");
        expect((await Customer.findById(customer._id)).creditBalance).toBe(method === "credit" ? 250 : 0);
        expect(stripe.refunds.create).toHaveBeenCalledTimes(method === "refund" ? 1 : 0);
        const after = await SubscriptionDelivery.findById(deliveries[0]._id);
        expect(after?.addOns.length || 0).toBe(0);
        expect((await send()).status).toBe(200);
        expect(stripe.refunds.create).toHaveBeenCalledTimes(method === "refund" ? 1 : 0);
        expect(await StoreCreditTransaction.countDocuments({ customer: customer._id })).toBe(method === "credit" ? 1 : 0);
      } finally {
        fail?.mockRestore();
        stripe.paymentIntents.retrieve.mockImplementation(originalRetrieve);
        stripe.refunds.retrieve.mockImplementation(originalRefundRetrieve);
      }
    },
  );

  it.each(["pause", "cancel", "remove-day"])("recovers a split card refund without duplicate money (%s)", async action => {
    const sub = await createBasicSubscription();
    const deliveries = await prepareUpcomingDeliveries(sub._id);
    const order = await createPaidOrderFor(sub);
    order.deliveryDate = deliveries[0].scheduledDate;
    order.total = order.amountPaid = 8;
    order.paymentAllocations = [
      { paymentIntentId: order.stripePaymentIntentId, amountMinor: 500, source: "subscription_invoice" },
      { paymentIntentId: "pi_supplemental", amountMinor: 500, source: "modification" },
    ];
    await order.save();
    await SubscriptionDelivery.findByIdAndUpdate(deliveries[0]._id, { order: order._id, status: "generated" });
    const payload = { operationId: crypto.randomUUID(), refundMethod: "refund" };
    let send;
    if (action === "remove-day") {
      const day = weekdayInTimeZone(order.deliveryDate, SUBSCRIPTION_TIME_ZONE);
      const otherDay = (day + 3) % 7;
      await Subscription.findByIdAndUpdate(sub._id, {
        preferredDeliveryDay: day, preferredDeliveryDays: [day, otherDay],
        deliveryDayPlans: [day, otherDay].map(day => ({ day, items: sub.items })),
        items: sub.items.map(item => ({ ...item, quantity: item.quantity * 2 })),
      });
      Object.assign(payload, {
        preferredDeliveryDay: otherDay, preferredDeliveryDays: [otherDay],
        deliveryAddressId: addressId,
        deliveryDayPlans: [{ day: otherDay, items: sub.items.map(item => ({
          variantId: String(item.variant), quantity: item.quantity,
        })) }],
      });
      send = body => request(app).patch(`/api/portal/subscriptions/${sub._id}`)
        .set("Authorization", `Bearer ${accessToken}`).send(body);
    } else {
      if (action === "pause") payload.resumeOn = new Date(Date.now() + 21 * 86400000).toISOString();
      send = body => request(app).post(`/api/portal/subscriptions/${sub._id}/${action}`)
        .set("Authorization", `Bearer ${accessToken}`).send(body);
    }
    stripe.paymentIntents.retrieve.mockResolvedValueOnce({ status: "succeeded", amount_received: 500 })
      .mockResolvedValueOnce({ status: "succeeded", amount_received: 500 });
    stripe.refunds.create.mockClear();
    stripe.refunds.create.mockResolvedValueOnce({ id: "re_split_first", amount: 500, status: "succeeded" })
      .mockRejectedValueOnce(new Error("Stripe connection reset"));
    const failed = await send(payload);
    expect(failed.status).toBe(400);
    expect(failed.body.data).toMatchObject({ refundPending: true, refundedMinor: 500, remainingMinor: 300 });
    expect(failed.body.message).toContain("£5.00");
    const failedRequest = stripe.refunds.create.mock.calls[1];
    const adminRefund = await refundService.RefundOrder({ orderId: order._id });
    expect(adminRefund.statusCode).toBe(409);
    expect(adminRefund.message).toMatch(/subscription cancellation or item-adjustment/);
    const pendingOrder = await Order.findById(order._id).select("+subscriptionRefundPlan").lean();
    expect(pendingOrder.refunds).toHaveLength(1);
    expect(pendingOrder.subscriptionRefundPlan.steps.map(step => step.params.amount)).toEqual([500, 300]);
    const credit = await send({ ...payload, operationId: crypto.randomUUID(), refundMethod: "credit" });
    expect(credit.status).toBe(400);
    expect((await Customer.findById(customer._id)).creditBalance).toBe(0);
    const addOn = await request(app).post(`/api/portal/subscriptions/${sub._id}/next-delivery/add-ons`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ operationId: crypto.randomUUID(), items: [{ variantId, quantity: 1 }] });
    expect(addOn.status).toBe(400);
    expect(addOn.body.message).toMatch(/refund is unfinished/);
    if (action === "remove-day") {
      const attempts = stripe.refunds.create.mock.calls.length;
      const changedProducts = await send({ ...payload, operationId: crypto.randomUUID(),
        deliveryDayPlans: payload.deliveryDayPlans.map(plan => ({ ...plan,
          items: plan.items.map(item => ({ ...item, quantity: item.quantity + 1 })),
        })),
      });
      expect(changedProducts.status).toBe(400);
      expect(changedProducts.body.message).toMatch(/product changes separately/);
      const changedNotes = await send({ ...payload, operationId: crypto.randomUUID(), notes: "New instructions" });
      expect(changedNotes.status).toBe(400);
      expect(changedNotes.body.message).toMatch(/refund is unfinished/);
      expect(stripe.refunds.create).toHaveBeenCalledTimes(attempts);
    }
    // Legacy allocation records can make a webhook derive terminal status early.
    // The durable plan, rather than that status alone, controls recovery.
    await Order.findByIdAndUpdate(order._id, { status: action === "cancel" ? "refunded" : "refund_pending" });
    stripe.refunds.create.mockResolvedValueOnce({ id: "re_split_second", amount: 300, status: "succeeded" });
    const retry = await send(payload);
    expect(retry.status).toBe(200);
    expect(retry.body.data.refundedMinor).toBe(800);
    expect(stripe.refunds.create.mock.calls[2]).toEqual(failedRequest);
    expect(stripe.refunds.create).toHaveBeenCalledTimes(3);
    const final = await Order.findById(order._id).lean();
    expect(final.status).toBe("refunded");
    expect(final.refunds.map(record => record.amountMinor)).toEqual([500, 300]);
    expect(final.subscriptionRefundPlan).toBeUndefined();
    await refundService.applyStripeRefundSucceeded({
      orderId: order._id, paymentIntentId: order.stripePaymentIntentId,
      stripeRefundId: "re_split_first", amountMinor: 500, currency: "gbp",
    });
    expect((await Order.findById(order._id)).status).toBe("refunded");
    expect((await send(payload)).status).toBe(200);
    expect(stripe.refunds.create).toHaveBeenCalledTimes(3);
  });

  it.each([false, true])("changes paid-order addresses atomically (write failure: %s)", async failWrite => {
    const sub = await createBasicSubscription();
    const deliveries = await prepareUpcomingDeliveries(sub._id);
    const oldAddress = sub.deliveryAddress.line1;
    if (failWrite) await Subscription.findByIdAndUpdate(sub._id, { pendingChanges: {
      deliveryAddress: { ...sub.deliveryAddress, line1: "Stale pending address" },
      effectiveFrom: new Date(Date.now() + 20 * 86400000),
    } });
    const orders = [];
    for (let i = 0; i < 4; i += 1) {
      const order = await createPaidOrderFor(sub);
      order.deliveryDate = new Date(new Date(deliveries[0].scheduledDate).getTime() + i * 86400000);
      if (i === 2) order.deliveryStatus = "dispatched";
      if (i === 3) order.deliveryDate = new Date(Date.now() - 86400000);
      await order.save(); orders.push(order);
    }
    const customerDoc = await Customer.findById(customer._id);
    customerDoc.addresses.push({ label: "New home", fullName: "Test Customer", line1: "22 New Street",
      city: "Cambridge", postcode: "CB1 1AA", country: "UK", deliveryInstructions: "Use side door" });
    await customerDoc.save();
    const newAddressId = String(customerDoc.addresses.at(-1)._id);
    const payload = { operationId: crypto.randomUUID(), deliveryAddressId: newAddressId };
    const send = () => request(app).patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`).send(payload);
    if (failWrite) {
      const save = jest.spyOn(Order.prototype, "save").mockRejectedValueOnce(new Error("order unavailable"));
      expect((await send()).status).toBe(500);
      save.mockRestore();
      expect((await Subscription.findById(sub._id)).deliveryAddress.line1).toBe(oldAddress);
      expect((await Order.findById(orders[0]._id)).deliveryAddress.line1).toBe(oldAddress);
    }
    require("../../Integration/google.geocode").geocodeAddress.mockResolvedValueOnce({ lat: 52.2, lng: 0.12 });
    const result = await send();
    expect(result.status).toBe(200);
    expect((await Subscription.findById(sub._id)).deliveryAddress.line1).toBe("22 New Street");
    expect((await Subscription.findById(sub._id)).pendingChanges?.deliveryAddress?.line1).toBeUndefined();
    for (let i = 0; i < orders.length; i += 1) {
      const saved = await Order.findById(orders[i]._id);
      expect(saved.deliveryAddress.line1).toBe(i < 2 ? "22 New Street" : oldAddress);
      if (i < 2) {
        expect(saved.location.lat).toBe(52.2);
        expect(saved.location.lng).toBe(0.12);
        expect(saved.customerInstructions).toBe("Use side door");
      }
      expect(saved.total).toBe(orders[i].total);
      expect(saved.amountPaid).toBe(orders[i].amountPaid);
    }
  });

  it.each(["linked-slot", "regenerate", "subscription", "address"])("rolls back every schedule write and safely retries after a %s failure", async boundary => {
    const now = jest.spyOn(subscriptionClock, "now").mockReturnValue(Date.parse("2026-07-07T12:00:00Z"));
    let failure;
    try {
      await SubscriptionSettings.findOneAndUpdate({ singletonKey: "subscription-settings" }, {
        deliveryDays: [0, 3], cutoffDaysBefore: 0, cutoffTime: "23:59",
      }, { upsert: true });
      const sub = await createBasicSubscription();
      const order = await createPaidOrderFor(sub);
      const linked = await SubscriptionDelivery.findOneAndUpdate({ subscription: sub._id,
        scheduledDate: new Date(sub.nextDeliveryDate) }, { order: order._id, status: "generated" }, { new: true });
      expect(linked).toBeTruthy();
      // A target slot already exists: moving the paid order must not collide
      // with it, and failed deletion/regeneration must restore it too.
      await SubscriptionDelivery.create({ subscription: sub._id, customer: customer._id,
        scheduledDate: new Date("2026-07-07T23:00:00Z"), status: "scheduled" });
      const customerDoc = await Customer.findById(customer._id);
      customerDoc.addresses.push({ label: "New", fullName: "Test Customer", line1: "22 New Street",
        city: "London", postcode: "SW1A 1AA", country: "UK" });
      await customerDoc.save();
      const payload = { operationId: crypto.randomUUID(), preferredDeliveryDays: [3], preferredDeliveryDay: 3,
        ...(boundary === "address" ? { deliveryAddressId: String(customerDoc.addresses.at(-1)._id) } : {}) };
      const send = () => request(app).patch(`/api/portal/subscriptions/${sub._id}`)
        .set("Authorization", `Bearer ${accessToken}`).send(payload);
      const state = async () => ({
        subscription: await Subscription.findById(sub._id)
          .select("frequency preferredDeliveryDay preferredDeliveryDays nextDeliveryDate deliveryAddress customerVersion").lean(),
        order: await Order.findById(order._id).select("deliveryDate deliveryAddress items total amountPaid").lean(),
        slots: await SubscriptionDelivery.find({ subscription: sub._id }).sort({ _id: 1 })
          .select("scheduledDate order status addOns").lean(),
      });
      const before = await state();
      stripe.prices.create.mockClear();
      if (boundary === "linked-slot") failure = jest.spyOn(SubscriptionDelivery, "updateMany")
        .mockRejectedValueOnce(new Error("linked slot write failed"));
      if (boundary === "regenerate") failure = jest.spyOn(SubscriptionDelivery, "updateOne")
        .mockRejectedValueOnce(new Error("slot regeneration failed"));
      if (boundary === "subscription") failure = jest.spyOn(Subscription.prototype, "save")
        .mockRejectedValueOnce(new Error("subscription save failed"));
      if (boundary === "address") {
        const original = Order.prototype.save;
        let saves = 0;
        failure = jest.spyOn(Order.prototype, "save").mockImplementation(function (...args) {
          if (++saves === 2) throw new Error("address save failed");
          return original.apply(this, args);
        });
      }
      expect((await send()).status).toBe(500);
      failure.mockRestore();
      expect(await state()).toEqual(before);
      expect(stripe.prices.create).not.toHaveBeenCalled();
      expect((await send()).status).toBe(200);
      const after = await state();
      expect(after.subscription.preferredDeliveryDays).toEqual([3]);
      expect(weekdayInTimeZone(after.order.deliveryDate, SUBSCRIPTION_TIME_ZONE)).toBe(3);
      expect(after.slots.find(slot => String(slot.order) === String(order._id)).scheduledDate)
        .toEqual(after.order.deliveryDate);
      expect(after.slots).toHaveLength(3);
      expect(after.order.total).toBe(before.order.total);
      expect(after.order.amountPaid).toBe(before.order.amountPaid);
      if (boundary === "address") expect(after.order.deliveryAddress.line1).toBe("22 New Street");
    } finally { failure?.mockRestore(); now.mockRestore(); }
  });

  it("rejects unlocatable address changes before modifying the subscription or its order", async () => {
    const sub = await createBasicSubscription();
    await prepareUpcomingDeliveries(sub._id);
    const order = await createPaidOrderFor(sub);
    const customerDoc = await Customer.findById(customer._id);
    customerDoc.addresses.push({ label: "New", fullName: "Test", line1: "Unknown street",
      city: "London", postcode: "SW1A 1AA", country: "UK" });
    await customerDoc.save();
    require("../../Integration/google.geocode").geocodeAddress.mockRejectedValueOnce(new Error("Maps unavailable"));
    const response = await request(app).patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`).send({ deliveryAddressId: String(customerDoc.addresses.at(-1)._id) });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/locate this delivery address/);
    expect((await Subscription.findById(sub._id)).deliveryAddress.line1).toBe(sub.deliveryAddress.line1);
    expect((await Order.findById(order._id)).deliveryAddress.line1).toBe(sub.deliveryAddress.line1);
  });

  it.each([false, true])("updates equal-price fulfillment atomically (inject failure: %s)", async (fail) => {
    const { variant: second } = await createTestProduct();
    const created = await request(app).post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(), frequency: "weekly", preferredDeliveryDay: 0, deliveryAddressId: addressId,
        items: [{ variantId, quantity: 2 }, { variantId: String(second._id), quantity: 1 }] });
    expect(created.status).toBe(201);
    const sub = created.body.data.subscription;
    await prepareUpcomingDeliveries(sub._id);
    const order = await createPaidOrderFor(sub);
    const payload = { operationId: crypto.randomUUID(), items: sub.items.map((item) => ({
      itemId: item._id, quantity: item.quantity === 2 ? 1 : 2,
    })) };
    const send = () => request(app).put(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`).send(payload);
    stripe.paymentIntents.create.mockClear();
    stripe.refunds.create.mockClear();
    if (fail) {
      const save = jest.spyOn(Order.prototype, "save").mockRejectedValueOnce(new Error("order write failed"));
      expect((await send()).status).toBe(500);
      save.mockRestore();
      expect((await Subscription.findById(sub._id)).items.map(i => i.quantity)).toEqual([2, 1]);
      expect((await Order.findById(order._id)).items.map(i => i.quantity)).toEqual([2, 1]);
    }
    expect((await send()).status).toBe(200);
    expect((await Order.findById(order._id)).items.map(i => i.quantity)).toEqual([1, 2]);
    expect((await Subscription.findById(sub._id)).items.map(i => i.quantity)).toEqual([1, 2]);
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("rejects aggregate replacement of multi-day plans without side effects", async () => {
    const sub = await createBasicSubscription();
    await Subscription.findByIdAndUpdate(sub._id, {
      preferredDeliveryDays: [0, 3], deliveryDayPlans: [
        { day: 0, items: sub.items }, { day: 3, items: sub.items },
      ],
    });
    const before = await Subscription.findById(sub._id).lean();
    stripe.prices.create.mockClear();
    const res = await request(app).put(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ items: [{ itemId: sub.items[0]._id, quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/each delivery day/);
    const after = await Subscription.findById(sub._id).lean();
    expect(after.items).toEqual(before.items);
    expect(after.deliveryDayPlans).toEqual(before.deliveryDayPlans);
    expect(stripe.prices.create).not.toHaveBeenCalled();
  });

  it.each(["local-save", "remote-response"])("recovers creation after %s failure with frozen Stripe parameters", async (failurePoint) => {
    const payload = { operationId: crypto.randomUUID(), frequency: "weekly",
      preferredDeliveryDay: 0, deliveryAddressId: addressId, items: [{ variantId, quantity: 1 }] };
    const send = () => request(app).post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`).send(payload);
    stripe.products.create.mockClear();
    stripe.prices.create.mockClear();
    stripe.subscriptions.create.mockClear();
    let save;
    if (failurePoint === "local-save") {
      save = jest.spyOn(Subscription.prototype, "save").mockRejectedValueOnce(new Error("database unavailable"));
    } else {
      stripe.subscriptions.create.mockRejectedValueOnce(new Error("connection reset after payment"));
    }
    const failed = await send();
    expect(failed.status).toBe(failurePoint === "local-save" ? 500 : 400);
    save?.mockRestore();
    const originalRequest = stripe.subscriptions.create.mock.calls[0];
    await ProductVariant.findByIdAndUpdate(variantId, { price: 9.99 });
    await Customer.findByIdAndUpdate(customer._id, { firstName: "Changed" });
    stripe.customers.retrieve.mockResolvedValueOnce({ invoice_settings: { default_payment_method: "pm_changed" } });
    const retry = await send();
    expect(retry.status).toBe(201);
    expect(retry.body.data.subscription.subscriptionNumber).toBe(originalRequest[0].metadata.subscriptionNumber);
    expect(retry.body.data.subscription.items[0].unitPrice).toBe(2.5);
    expect(stripe.products.create).toHaveBeenCalledTimes(1);
    expect(stripe.prices.create).toHaveBeenCalledTimes(1);
    if (failurePoint === "remote-response") {
      expect(stripe.subscriptions.create.mock.calls[1]).toEqual(originalRequest);
    } else {
      expect(stripe.subscriptions.create).toHaveBeenCalledTimes(1);
    }
    expect(await Subscription.countDocuments({ customer: customer._id })).toBe(1);
  });

  it("blocks a replacement creation after a lost provider response and permits the original retry", async () => {
    const payload = { operationId: crypto.randomUUID(), frequency: "weekly", preferredDeliveryDay: 0,
      deliveryAddressId: addressId, items: [{ variantId, quantity: 1 }] };
    const send = body => request(app).post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`).send(body);
    stripe.subscriptions.create.mockClear();
    stripe.subscriptions.create.mockRejectedValueOnce(new Error("provider response lost"));
    expect((await send(payload)).status).toBe(400);
    const replacement = await send({ ...payload, operationId: crypto.randomUUID(), items: [{ variantId, quantity: 2 }] });
    expect(replacement.status).toBe(409);
    expect(stripe.subscriptions.create).toHaveBeenCalledTimes(1);
    expect((await send(payload)).status).toBe(201);
    expect(await Subscription.countDocuments({ customer: customer._id })).toBe(1);
    expect((await Customer.findById(customer._id).select("+paymentMethodLock")).paymentMethodLock).toBeNull();
  });

  it("blocks subscription creation while a card deletion or default change owns the customer lease", async () => {
    await Customer.updateOne({ _id: customer._id }, { $set: { paymentMethodLock: {
      token: "card-worker", expiresAt: new Date(Date.now() + 120000),
    } } });
    stripe.subscriptions.create.mockClear();
    const response = await request(app).post("/api/portal/subscriptions").set("Authorization", `Bearer ${accessToken}`)
      .send({ operationId: crypto.randomUUID(), frequency: "weekly", preferredDeliveryDay: 0,
        deliveryAddressId: addressId, items: [{ variantId, quantity: 1 }] });
    expect(response.status).toBe(409);
    expect(response.body.data.subscriptionBusy).toBe(true);
    expect(response.body.data.retryable).toBe(true);
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    expect((await Customer.findById(customer._id).select("+paymentMethodLock")).paymentMethodLock.token).toBe("card-worker");
  });

  it("does not resubmit an ambiguous creation after Stripe's retry window", async () => {
    const operationId = crypto.randomUUID();
    const payload = { operationId, frequency: "weekly", preferredDeliveryDay: 0,
      deliveryAddressId: addressId, items: [{ variantId, quantity: 1 }] };
    const send = () => request(app).post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`).send(payload);
    stripe.subscriptions.create.mockRejectedValueOnce(new Error("connection reset"));
    expect((await send()).status).toBe(400);
    await require("../../models/subscriptionMutation.model").updateOne(
      { customer: customer._id, operationId },
      { $set: { "creationSnapshot.startedAt": new Date(Date.now() - 25 * 3600000) } },
    );
    stripe.subscriptions.create.mockClear();
    const retry = await send();
    expect(retry.status).toBe(400);
    expect(retry.body.message).toMatch(/reconciliation/);
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    expect(await Subscription.countDocuments({ customer: customer._id })).toBe(0);
  });

  it("retries a definitive creation decline with a saved fresh key and releases unpaid stock", async () => {
    const payload = { operationId: crypto.randomUUID(), frequency: "weekly", preferredDeliveryDay: 0,
      deliveryAddressId: addressId, items: [{ variantId, quantity: 1 }] };
    const send = () => request(app).post("/api/portal/subscriptions").set("Authorization", `Bearer ${accessToken}`).send(payload);
    stripe.subscriptions.create.mockClear();
    stripe.products.create.mockClear();
    stripe.prices.create.mockClear();
    stripe.subscriptions.create.mockRejectedValueOnce(Object.assign(new Error("Card declined"), { type: "StripeCardError", statusCode: 402 }));
    const declined = await send();
    expect(declined.status).toBe(400);
    expect(declined.body.data.paymentOutcome).toBe("declined");
    expect((await ProductVariant.findById(variantId)).reservedQuantity).toBe(0);
    const originalKey = stripe.subscriptions.create.mock.calls[0][1].idempotencyKey;
    await ProductVariant.updateOne({ _id: variantId }, { $set: { stockQuantity: 0 } });
    expect((await send()).body.data.paymentOutcome).toBe("declined");
    expect(stripe.subscriptions.create).toHaveBeenCalledTimes(1);
    await ProductVariant.updateOne({ _id: variantId }, { $set: { stockQuantity: 100 } });
    stripe.customers.retrieve.mockResolvedValue({ invoice_settings: { default_payment_method: "pm_replacement" } });
    expect((await send()).status).toBe(201);
    expect(stripe.subscriptions.create.mock.calls[1][1].idempotencyKey).toBe(`${originalKey}:attempt:2`);
    expect(stripe.subscriptions.create.mock.calls[1][0]).toEqual({ ...stripe.subscriptions.create.mock.calls[0][0],
      default_payment_method: "pm_replacement" });
    expect(stripe.products.create).toHaveBeenCalledTimes(1);
    expect(stripe.prices.create).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("blocks a generic admin refund of a subscription after a decrease (allocations: %s)", async (withAllocations) => {
    const sub = await createBasicSubscription();
    const order = await createPaidOrderFor(sub);
    order.total = 3.5;
    order.subtotal = 3.5;
    order.amountPaid = 3.5;
    order.status = "partially_refunded";
    order.refunds = [{ stripeRefundId: "re_first", amountMinor: 500, status: "succeeded" }];
    if (withAllocations) order.paymentAllocations = [{
      paymentIntentId: order.stripePaymentIntentId, source: "subscription_invoice", amountMinor: 850,
    }];
    await order.save();
    stripe.refunds.create.mockClear();
    const partial = await refundService.RefundOrder({ orderId: order._id, amount: 1, restock: true });
    expect(partial).toMatchObject({ success: false, statusCode: 409 });
    expect(partial.message).toMatch(/subscription cancellation or item-adjustment/);
    const final = await refundService.RefundOrder({ orderId: order._id });
    expect(final).toMatchObject({ success: false, statusCode: 409 });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect((await Order.findById(order._id)).status).toBe("partially_refunded");
  });

  it("replays a completed subscription creation operation without creating or charging twice", async () => {
    const operationId = crypto.randomUUID();
    stripe.products.create.mockClear();
    stripe.prices.create.mockClear();
    stripe.subscriptions.create.mockClear();

    const payload = {
      operationId,
      frequency: "weekly",
      preferredDeliveryDay: 0,
      deliveryAddressId: addressId,
      items: [{ variantId, quantity: 1 }],
    };

    const first = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);
    const second = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.subscription._id).toBe(
      first.body.data.subscription._id,
    );
    expect(stripe.products.create).toHaveBeenCalledTimes(1);
    expect(stripe.prices.create).toHaveBeenCalledTimes(1);
    expect(stripe.subscriptions.create).toHaveBeenCalledTimes(1);
    expect(
      await Subscription.countDocuments({ customer: customer._id }),
    ).toBe(1);
  });

  it("deduplicates an incremental add-item retry with the same operation ID", async () => {
    const sub = await createBasicSubscription();
    await prepareUpcomingDeliveries(sub._id);
    const extra = await createTestProduct();
    const operationId = crypto.randomUUID();

    stripe.paymentIntents.create.mockClear();

    const payload = {
      operationId,
      variantId: extra.variant._id.toString(),
      quantity: 1,
    };

    const first = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);
    const second = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const refreshed = await Subscription.findById(sub._id).lean();
    const added = refreshed.items.find(
      (item) => String(item.variant) === String(extra.variant._id),
    );
    expect(added.quantity).toBe(1);
    expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
  });

  it("rejects reusing an operation ID for a different mutation payload", async () => {
    const sub = await createBasicSubscription();
    await prepareUpcomingDeliveries(sub._id);
    const extra = await createTestProduct();
    const operationId = crypto.randomUUID();

    const first = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId,
        variantId: extra.variant._id.toString(),
        quantity: 1,
      });

    const conflict = await request(app)
      .post(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId,
        variantId: extra.variant._id.toString(),
        quantity: 2,
      });

    expect(first.status).toBe(200);
    expect(conflict.status).toBe(409);
    expect(conflict.body.message).toMatch(/operation ID/i);
  });


  it("keeps wallet balance and ledger atomic when the ledger write fails", async () => {
    await StoreCreditTransaction.init();
    const failure = jest
      .spyOn(StoreCreditTransaction, "create")
      .mockRejectedValueOnce(new Error("Injected ledger failure"));

    await expect(
      storeCreditService.addCredit({
        customerId: customer._id,
        amountMinor: 500,
        type: "subscription_refund",
        reason: "Atomic wallet regression",
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow(/ledger failure/i);

    failure.mockRestore();
    const refreshed = await Customer.findById(customer._id).lean();
    expect(refreshed.creditBalance).toBe(0);
    expect(
      await StoreCreditTransaction.countDocuments({ customer: customer._id }),
    ).toBe(0);
  });

  it("replays the same wallet credit key without crediting twice", async () => {
    await StoreCreditTransaction.init();
    const idempotencyKey = `wallet:${crypto.randomUUID()}`;
    const payload = {
      customerId: customer._id,
      amountMinor: 375,
      type: "subscription_refund",
      reason: "Wallet retry regression",
      idempotencyKey,
    };

    const first = await storeCreditService.addCredit(payload);
    const replay = await storeCreditService.addCredit(payload);

    expect(first.ok).toBe(true);
    expect(replay.ok).toBe(true);
    expect(replay.replayed).toBe(true);

    const refreshed = await Customer.findById(customer._id).lean();
    expect(refreshed.creditBalance).toBe(375);
    expect(
      await StoreCreditTransaction.countDocuments({
        customer: customer._id,
        idempotencyKey,
      }),
    ).toBe(1);
  });

  it.each([
    ["single", "order-save"], ["multi", "order-save"],
    ["single", "payment-checkpoint"], ["single", "remote-response"],
    ["single", "response-save"],
  ])("recovers paid item increases atomically (%s, %s)", async (mode, failurePoint) => {
    const created = await request(app).post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(), frequency: "weekly", preferredDeliveryDay: 0, deliveryAddressId: addressId,
        items: [{ variantId, quantity: 3 }] });
    expect(created.status).toBe(201);
    const sub = created.body.data.subscription;
    const deliveries = await prepareUpcomingDeliveries(sub._id);
    const order = await createPaidOrderFor(sub);
    order.deliveryDate = deliveries[0].scheduledDate;
    await order.save();
    const day = weekdayInTimeZone(order.deliveryDate, SUBSCRIPTION_TIME_ZONE);
    const otherDay = (day + 3) % 7;
    if (mode === "multi") {
      await Subscription.findByIdAndUpdate(sub._id, {
        preferredDeliveryDay: day, preferredDeliveryDays: [day, otherDay],
        deliveryDayPlans: [day, otherDay].map(day => ({ day, items: sub.items })),
        items: sub.items.map(item => ({ ...item, quantity: 6 })),
      });
    }
    const before = await Subscription.findById(sub._id).lean();
    const payload = { operationId: crypto.randomUUID(), expectedVersion: before.customerVersion,
      ...(mode === "single" ? { items: [{ itemId: sub.items[0]._id, quantity: 4 }] }
        : { changedDeliveryDays: [day], deliveryDayPlans: [
            { day, items: [{ variantId, quantity: 4 }] },
            { day: otherDay, items: [{ variantId, quantity: 3 }] },
          ] }) };
    const send = () => (mode === "single"
      ? request(app).put(`/api/portal/subscriptions/${sub._id}/items`)
      : request(app).patch(`/api/portal/subscriptions/${sub._id}`))
      .set("Authorization", `Bearer ${accessToken}`).send(payload);
    stripe.paymentIntents.create.mockClear();
    let fault;
    const Mutation = require("../../models/subscriptionMutation.model");
    if (failurePoint === "order-save") {
      fault = jest.spyOn(Order.prototype, "save").mockRejectedValueOnce(new Error("injected order failure"));
    } else if (failurePoint === "remote-response") {
      stripe.paymentIntents.create.mockRejectedValueOnce(new Error("response lost after capture"));
    } else {
      const original = Mutation.updateOne.bind(Mutation);
      let injected = false;
      fault = jest.spyOn(Mutation, "updateOne").mockImplementation((filter, update, options) => {
        const target = failurePoint === "payment-checkpoint"
          ? update.$set?.["itemIncreaseSnapshot.paymentIntent"]
          : update.$set?.status === "completed" && !options?.session;
        if (target && !injected) { injected = true; throw new Error("injected checkpoint failure"); }
        return original(filter, update, options);
      });
    }
    const failed = await send();
    expect(failed.status).toBe(failurePoint === "remote-response" ? 400 : 500);
    fault?.mockRestore();
    const afterFailure = await Subscription.findById(sub._id).lean();
    const failedOrder = await Order.findById(order._id).lean();
    if (failurePoint === "response-save") {
      expect(afterFailure.items[0].quantity).toBe(4);
      expect(failedOrder.items[0].quantity).toBe(4);
      expect((await Mutation.findOne({ operationId: payload.operationId })).status).toBe("completed");
    } else {
      expect(afterFailure.items).toEqual(before.items);
      expect(afterFailure.customerVersion).toBe(before.customerVersion);
      expect(failedOrder.items[0].quantity).toBe(3);
      expect(failedOrder.amountPaid).toBe(7.5);
      const conflicting = await request(app).post(`/api/portal/subscriptions/${sub._id}/pause`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ operationId: crypto.randomUUID(), resumeOn: new Date(Date.now() + 21 * 86400000).toISOString() });
      expect(conflicting.status).toBe(409);
    }
    await SubscriptionSettings.updateOne({ singletonKey: "subscription-settings" }, { $set: { cutoffDaysBefore: 14 } });
    // Recovery must use the original card and amount even after mutable data changes.
    await ProductVariant.findByIdAndUpdate(variantId, { price: 99 });
    stripe.customers.retrieve.mockResolvedValue({ invoice_settings: { default_payment_method: "pm_changed" } });
    const recovered = await send();
    expect(recovered.status).toBe(200);
    expect(recovered.body.data.chargedMinor).toBe(250);
    const fulfilled = await Order.findById(order._id).lean();
    expect(fulfilled.items[0].quantity).toBe(4);
    expect(fulfilled.items[0].price).toBe(2.5);
    expect(fulfilled.amountPaid).toBe(10);
    expect(fulfilled.paymentAllocations.filter(a => a.source === "modification")).toHaveLength(1);
    const plan = await Subscription.findById(sub._id).lean();
    expect(plan.items[0].quantity).toBe(mode === "multi" ? 7 : 4);
    if (mode === "multi") expect(plan.deliveryDayPlans.find(p => p.day === otherDay).items[0].quantity).toBe(3);
    expect((await send()).status).toBe(200);
    const calls = stripe.paymentIntents.create.mock.calls;
    expect(calls).toHaveLength(["payment-checkpoint", "remote-response"].includes(failurePoint) ? 2 : 1);
    for (const call of calls) expect(call).toEqual(calls[0]);
  });

  it.each([
    ["pause", "credit", false], ["pause", "refund", false],
    ["cancel", "credit", false], ["cancel", "refund", false],
    ["remove-day", "credit", false], ["remove-day", "refund", false],
    ["pause", "credit", true], ["cancel", "refund", true],
  ])("settles only remaining value after credit decrease (%s, %s, add-on: %s)", async (action, refundMethod, withAddOn) => {
    const created = await request(app).post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(), frequency: "weekly", preferredDeliveryDay: 0, deliveryAddressId: addressId,
        items: [{ variantId, quantity: 3 }] });
    expect(created.status).toBe(201);
    const sub = created.body.data.subscription;
    const deliveries = await prepareUpcomingDeliveries(sub._id);
    const order = await createPaidOrderFor(sub);
    order.deliveryDate = deliveries[0].scheduledDate;
    order.deliveryFee = 1;
    order.total += 1;
    order.amountPaid += 1;
    await order.save();
    await SubscriptionDelivery.findByIdAndUpdate(deliveries[0]._id, {
      order: order._id, status: "generated", generatedAt: new Date(),
    });
    if (withAddOn) {
      const added = await request(app).post(`/api/portal/subscriptions/${sub._id}/next-delivery/add-ons`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ operationId: crypto.randomUUID(), items: [{ variantId, quantity: 1 }] });
      expect(added.status).toBe(200);
    }
    const decrease = await request(app).put(`/api/portal/subscriptions/${sub._id}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ operationId: crypto.randomUUID(), items: [{ itemId: sub.items[0]._id, quantity: 1 }], refundMethod: "credit" });
    expect(decrease.status).toBe(200);
    expect(decrease.body.data.creditedMinor).toBe(500);
    const remainingMinor = withAddOn ? 600 : 350;
    const decreasedOrder = await Order.findById(order._id).lean();
    expect(decreasedOrder.amountPaid).toBe(withAddOn ? 11 : 8.5);
    expect(decreasedOrder.total).toBe(remainingMinor / 100);

    let send;
    const payload = { operationId: crypto.randomUUID(), refundMethod };
    if (action === "remove-day") {
      const day = weekdayInTimeZone(order.deliveryDate, SUBSCRIPTION_TIME_ZONE);
      const otherDay = (day + 3) % 7;
      const updated = await Subscription.findById(sub._id).lean();
      await Subscription.findByIdAndUpdate(sub._id, {
        preferredDeliveryDay: day, preferredDeliveryDays: [day, otherDay],
        deliveryDayPlans: [day, otherDay].map(day => ({ day, items: updated.items })),
        items: updated.items.map(item => ({ ...item, quantity: item.quantity * 2 })),
      });
      Object.assign(payload, { preferredDeliveryDay: otherDay, preferredDeliveryDays: [otherDay] });
      send = () => request(app).patch(`/api/portal/subscriptions/${sub._id}`);
    } else {
      if (action === "pause") payload.resumeOn = new Date(Date.now() + 21 * 86400000).toISOString();
      send = () => request(app).post(`/api/portal/subscriptions/${sub._id}/${action}`);
    }
    stripe.refunds.create.mockClear();
    const settle = () => send().set("Authorization", `Bearer ${accessToken}`).send(payload);
    const result = await settle();
    expect(result.status).toBe(200);
    expect(result.body.data[refundMethod === "credit" ? "creditedMinor" : "refundedMinor"]).toBe(remainingMinor);
    expect((await Customer.findById(customer._id)).creditBalance).toBe(500 + (refundMethod === "credit" ? remainingMinor : 0));
    if (refundMethod === "refund") {
      expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
      expect(stripe.refunds.create.mock.calls[0][0].amount).toBe(remainingMinor);
    } else {
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    }
    expect((await Order.findById(order._id)).status).toBe("refunded");
    const creditCount = await StoreCreditTransaction.countDocuments({ customer: customer._id });
    expect((await settle()).status).toBe(200);
    expect(await StoreCreditTransaction.countDocuments({ customer: customer._id })).toBe(creditCount);
    expect(stripe.refunds.create).toHaveBeenCalledTimes(refundMethod === "refund" ? 1 : 0);
  });

  it("rolls back a decrease if its order snapshot cannot commit, then retries once", async () => {
    await StoreCreditTransaction.init();
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 3 }],
      });
    expect(createRes.status).toBe(201);

    const sub = createRes.body.data.subscription;
    const itemId = sub.items[0]._id;
    const deliveries = await prepareUpcomingDeliveries(sub._id);
    const subtotal = sub.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
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
      deliveryAddress: sub.deliveryAddress,
      customerInstructions: "",
      location: { lat: 51.5, lng: -0.1 },
      deliveryDate: deliveries[0].scheduledDate,
      deliveryFee: 0,
      subtotal,
      total: subtotal,
      amountPaid: subtotal,
      status: "paid",
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(Date.now() + 86400000),
      orderType: "subscription_generated",
      subscription: sub._id,
      stripePaymentIntentId: `pi_paid_${crypto.randomUUID().slice(0, 8)}`,
      paidAt: new Date(),
    });
    await SubscriptionDelivery.findByIdAndUpdate(deliveries[0]._id, {
      status: "generated",
      order: order._id,
      generatedAt: new Date(),
    });

    const operationId = crypto.randomUUID();
    const failure = jest
      .spyOn(Order.prototype, "save")
      .mockRejectedValueOnce(new Error("Injected order save failure"));

    const first = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}/items/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ operationId, quantity: 1, refundMethod: "credit" });

    expect(first.status).toBe(500);
    failure.mockRestore();

    const failedSub = await Subscription.findById(sub._id).lean();
    const failedCustomer = await Customer.findById(customer._id).lean();
    const failedOrder = await Order.findById(order._id).lean();
    expect(failedSub.items[0].quantity).toBe(3);
    expect(failedCustomer.creditBalance).toBe(0);
    expect(failedOrder.amountPaid).toBe(subtotal);
    expect(
      await StoreCreditTransaction.countDocuments({
        customer: customer._id,
        type: "subscription_refund",
      }),
    ).toBe(0);

    const retry = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}/items/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ operationId, quantity: 1, refundMethod: "credit" });

    expect(retry.status).toBe(200);
    expect(retry.body.data.creditedMinor).toBe(500);

    const finalSub = await Subscription.findById(sub._id).lean();
    const finalCustomer = await Customer.findById(customer._id).lean();
    const finalOrder = await Order.findById(order._id).lean();
    expect(finalSub.items[0].quantity).toBe(1);
    expect(finalCustomer.creditBalance).toBe(500);
    // Store credit refunds value to the customer's wallet but does not reverse
    // the original card capture, so amountPaid remains the captured amount.
    expect(finalOrder.amountPaid).toBe(subtotal);
    expect(finalOrder.total).toBe(subtotal - 5);
    expect(finalOrder.items[0].quantity).toBe(1);
    expect(
      await StoreCreditTransaction.countDocuments({
        customer: customer._id,
        type: "subscription_refund",
      }),
    ).toBe(1);
  });

  it("keeps a subscription edit refund partial after the live order total decreases", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 2 }],
      });
    expect(createRes.status).toBe(201);

    const sub = createRes.body.data.subscription;
    const order = await Order.create({
      customer: customer._id,
      items: sub.items.map((item) => ({
        product: item.product,
        variant: item.variant,
        name: item.name,
        sku: item.sku,
        price: item.unitPrice,
        quantity: 1,
        subtotal: item.unitPrice,
      })),
      deliveryAddress: sub.deliveryAddress,
      customerInstructions: "",
      location: { lat: 51.5, lng: -0.1 },
      deliveryDate: new Date(sub.nextDeliveryDate),
      deliveryFee: 0,
      subtotal: 2.5,
      total: 2.5,
      amountPaid: 2.5,
      status: "paid",
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(Date.now() + 86400000),
      orderType: "subscription_generated",
      subscription: sub._id,
      stripePaymentIntentId: "pi_subscription_edit_partial",
      paidAt: new Date(),
      paymentAllocations: [{
        paymentIntentId: "pi_subscription_edit_partial",
        source: "subscription_invoice",
        amountMinor: 500,
      }],
    });

    await refundService.applyStripeRefundSucceeded({
      paymentIntentId: "pi_subscription_edit_partial",
      stripeRefundId: "re_subscription_edit_partial",
      amountMinor: 250,
      currency: "gbp",
      orderId: order._id,
    });

    const updated = await Order.findById(order._id).lean();
    expect(updated.status).toBe("partially_refunded");
  });


  it("records and replays a decrease across invoice and increase payments", async () => {
    const sub = await createBasicSubscription();
    const slots = await prepareUpcomingDeliveries(sub._id);
    await Subscription.findByIdAndUpdate(sub._id, { items: sub.items.map(item => ({ ...item, quantity: 3 })) });
    const order = await Order.create({ customer: customer._id, subscription: sub._id, orderType: "subscription_generated",
      items: sub.items.map(item => ({ product: item.product, variant: item.variant, name: item.name, sku: item.sku,
        quantity: 3, price: 2.5, subtotal: 7.5 })),
      deliveryAddress: sub.deliveryAddress, customerInstructions: "", location: { lat: 51.5, lng: 0 },
      deliveryDate: slots[0].scheduledDate, deliveryFee: 0, subtotal: 7.5, total: 7.5, amountPaid: 7.5,
      status: "paid", deliveryStatus: "ordered", reservationExpiresAt: new Date(Date.now() + 86400000),
      stripePaymentIntentId: "pi_split_invoice", paymentAllocations: [
        { paymentIntentId: "pi_split_invoice", source: "subscription_invoice", amountMinor: 250 },
        { paymentIntentId: "pi_split_increase", source: "modification", amountMinor: 500 },
      ] });
    stripe.paymentIntents.retrieve.mockImplementation(async id => ({ id, customer: customer.stripeCustomerId,
      currency: "gbp", status: "succeeded", amount_received: id === "pi_split_invoice" ? 250 : 500 }));
    const refunds = new Map();
    stripe.refunds.create.mockImplementation(async params => {
      const result = { id: `re_${params.payment_intent}`, amount: params.amount, payment_intent: params.payment_intent,
        currency: "gbp", status: "succeeded" }; refunds.set(result.id, result); return result;
    });
    stripe.refunds.retrieve.mockImplementation(async id => refunds.get(id));
    const payload = { operationId: crypto.randomUUID(), quantity: 1, refundMethod: "refund" };
    const send = () => request(app).patch(`/api/portal/subscriptions/${sub._id}/items/${sub.items[0]._id}`)
      .set("Authorization", `Bearer ${accessToken}`).send(payload);
    const failure = jest.spyOn(Order.prototype, "save").mockRejectedValueOnce(new Error("local write failed"));
    expect((await send()).status).toBe(500);
    failure.mockRestore();
    const retry = await send();
    expect(retry.status).toBe(200);
    expect(retry.body.data.refundedMinor).toBe(500);
    expect(stripe.refunds.create).toHaveBeenCalledTimes(2);
    const saved = await Order.findById(order._id);
    expect(saved.amountPaid).toBe(2.5);
    expect(saved.refunds.map(refund => refund.amountMinor)).toEqual([250, 250]);
    await refundService.applyStripeRefundSucceeded({ paymentIntentId: "pi_split_increase", stripeRefundId: "re_pi_split_increase",
      amountMinor: 250, currency: "gbp", orderId: order._id });
    expect((await Order.findById(order._id)).refunds).toHaveLength(2);
    expect((await Order.findById(order._id)).status).toBe("partially_refunded");
    expect((await send()).status).toBe(200);
    expect(stripe.refunds.create).toHaveBeenCalledTimes(2);
  });

  it("automatically upgrades a legacy subscription with no customerVersion", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(createRes.status).toBe(201);
    const subscriptionId = createRes.body.data.subscription._id;

    // Simulate a subscription created before customerVersion was introduced.
    await Subscription.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(subscriptionId) },
      { $unset: { customerVersion: "" } },
    );

    const detail = await request(app)
      .get(`/api/portal/subscriptions/${subscriptionId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(detail.status).toBe(200);
    expect(detail.body.data.subscription.customerVersion).toBe(0);

    const list = await request(app)
      .get("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(list.status).toBe(200);
    const listed = list.body.data.subscriptions.find(
      (subscription) => subscription._id === subscriptionId,
    );
    expect(listed.customerVersion).toBe(0);

    const update = await request(app)
      .patch(`/api/portal/subscriptions/${subscriptionId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
        expectedVersion: 0,
        notes: "Legacy subscription upgraded safely",
      });

    expect(update.status).toBe(200);
    expect(update.body.data.subscription.customerVersion).toBe(1);

    const stored = await Subscription.collection.findOne({
      _id: new mongoose.Types.ObjectId(subscriptionId),
    });
    expect(stored.customerVersion).toBe(1);
    expect(stored.notes).toBe("Legacy subscription upgraded safely");
  });


  it("rejects stale subscription edits instead of overwriting a newer version", async () => {
    const createRes = await request(app)
      .post("/api/portal/subscriptions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
        frequency: "weekly",
        preferredDeliveryDay: 0,
        deliveryAddressId: addressId,
        items: [{ variantId, quantity: 1 }],
      });

    expect(createRes.status).toBe(201);
    const sub = createRes.body.data.subscription;
    const initialVersion = Number(sub.customerVersion || 0);

    const first = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
        expectedVersion: initialVersion,
        notes: "Saved from the first tab",
      });

    expect(first.status).toBe(200);
    const nextVersion = first.body.data.subscription.customerVersion;
    expect(nextVersion).toBe(initialVersion + 1);

    const stale = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
        expectedVersion: initialVersion,
        notes: "Stale overwrite",
      });

    expect(stale.status).toBe(409);
    expect(stale.body.message).toMatch(/changed while you were editing/i);

    const afterStale = await Subscription.findById(sub._id).lean();
    expect(afterStale.notes).toBe("Saved from the first tab");
    expect(afterStale.customerVersion).toBe(nextVersion);

    const fresh = await request(app)
      .patch(`/api/portal/subscriptions/${sub._id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        operationId: crypto.randomUUID(),
        expectedVersion: nextVersion,
        notes: "Saved after refresh",
      });

    expect(fresh.status).toBe(200);
    expect(fresh.body.data.subscription.customerVersion).toBe(nextVersion + 1);
    expect(fresh.body.data.subscription.notes).toBe("Saved after refresh");
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
