"use strict";

const request = require("supertest");
const crypto = require("crypto");
const mongoose = require("mongoose");
const app = require("../testApp");

const Customer = require("../../models/customer.model");
const Product = require("../../models/product.model");
const ProductVariant = require("../../models/variant.model");
const Subscription = require("../../models/subscription.model");
const SubscriptionDelivery = require("../../models/subscriptionDelivery.model");
const Order = require("../../models/order.model");
const CustomerNotification = require("../../models/customerNotification.model");
const geocode = require("../../Integration/google.geocode");
const stripe = require("../../utils/stripe.util");

async function createCustomer() {
  return Customer.create({
    firstName: "Webhook",
    lastName: "Tester",
    email: `webhook-${crypto.randomUUID()}@test.com`,
    status: "active",
    isGuest: false,
    emailVerifiedAt: new Date(),
    stripeCustomerId: `cus_${crypto.randomUUID().replace(/-/g, "")}`,
    addresses: [
      {
        label: "Home",
        fullName: "Webhook Tester",
        line1: "1 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
        isDefault: true,
      },
    ],
  });
}

async function createProductAndVariant() {
  const product = await Product.create({
    name: `Webhook Product ${crypto.randomUUID()}`,
    slug: `webhook-product-${crypto.randomUUID()}`,
    category: "dairy",
    description: "Webhook subscription test product",
    status: "active",
    isSubscriptionEligible: true,
    thumbnailImage: new mongoose.Types.ObjectId(),
  });

  const variant = await ProductVariant.create({
    product: product._id,
    name: "500ml",
    sku: `WB-SKU-${crypto.randomUUID()}`,
    price: 2.5,
    stockQuantity: 100,
    status: "active",
  });

  return { product, variant };
}

function buildSubscriptionItem(product, variant, quantity) {
  return {
    product: product._id,
    variant: variant._id,
    name: variant.name,
    sku: variant.sku,
    quantity,
    unitPrice: variant.price,
  };
}

async function postStripeEvent(body) {
  return request(app)
    .post("/api/webhooks/stripe")
    .set("stripe-signature", "test_sig")
    .send(body);
}

async function createSubscriptionFixture({
  customer,
  stripeSubscriptionId,
  nextDeliveryDate,
  items,
  deliveryDayPlans,
  pendingChanges,
  pendingPriceSync = false,
  status = "active",
} = {}) {
  return Subscription.create({
    subscriptionNumber: `SUB-TEST-${crypto.randomUUID().slice(0, 8)}`,
    customer,
    frequency: "weekly",
    preferredDeliveryDay: 0,
    preferredDeliveryDays: [0],
    nextDeliveryDate,
    startDate: new Date("2026-07-01T10:00:00.000Z"),
    deliveryAddress: {
      line1: "10 Test Street",
      city: "London",
      postcode: "SW1A 1AA",
      country: "United Kingdom",
    },
    items,
    deliveryDayPlans,
    pendingChanges,
    pendingPriceSync,
    status,
    stripeSubscriptionId,
    stripeProductId: "prod_test_sub",
    stripePriceId: "price_test_sub",
  });
}

describe("Subscription Stripe webhook E2E", () => {
  it("creates orders for each scheduled slot in the billing window and advances nextDeliveryDate", async () => {
    const customer = await createCustomer();
    const { product, variant } = await createProductAndVariant();

    const sundaySlot = new Date("2026-07-12T09:00:00.000Z");
    const wednesdaySlot = new Date("2026-07-15T09:00:00.000Z");

    const baseItem = buildSubscriptionItem(product, variant, 1);

    const subscription = await Subscription.create({
      subscriptionNumber: `SUB-TEST-${crypto.randomUUID().slice(0, 8)}`,
      customer: customer._id,
      frequency: "weekly",
      preferredDeliveryDay: 0,
      preferredDeliveryDays: [0, 3],
      nextDeliveryDate: sundaySlot,
      startDate: new Date("2026-07-01T10:00:00.000Z"),
      deliveryAddress: {
        line1: "1 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
      },
      items: [baseItem],
      deliveryDayPlans: [
        { day: 0, items: [buildSubscriptionItem(product, variant, 1)] },
        { day: 3, items: [buildSubscriptionItem(product, variant, 2)] },
      ],
      status: "active",
      stripeSubscriptionId: "sub_test_webhook_multi_1",
      stripeProductId: "prod_test_sub",
      stripePriceId: "price_test_sub",
    });

    await SubscriptionDelivery.create([
      {
        subscription: subscription._id,
        customer: customer._id,
        scheduledDate: sundaySlot,
        status: "scheduled",
      },
      {
        subscription: subscription._id,
        customer: customer._id,
        scheduledDate: wednesdaySlot,
        status: "scheduled",
      },
    ]);

    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "test_sig")
      .send({
        type: "invoice.payment_succeeded",
        data: {
          object: {
            id: "in_test_multi_1",
            subscription: "sub_test_webhook_multi_1",
            billing_reason: "subscription_create",
            payment_intent: "pi_test_multi_1",
            status_transitions: { paid_at: 1783846800 },
          },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    const orders = await Order.find({
      subscription: subscription._id,
      stripeInvoiceId: "in_test_multi_1",
    })
      .sort({ deliveryDate: 1 })
      .lean();

    expect(orders).toHaveLength(2);
    expect(orders[0].items[0].quantity).toBe(1);
    expect(orders[1].items[0].quantity).toBe(2);

    const updatedSub = await Subscription.findById(subscription._id).lean();
    const expectedNext = new Date(sundaySlot);
    expectedNext.setDate(expectedNext.getDate() + 7);
    expect(new Date(updatedSub.nextDeliveryDate).toISOString()).toBe(
      expectedNext.toISOString(),
    );

    const updatedSlots = await SubscriptionDelivery.find({
      subscription: subscription._id,
    }).lean();
    expect(
      updatedSlots.filter((slot) => slot.status === "generated").length,
    ).toBe(2);

    const notice = await CustomerNotification.findOne({
      customer: customer._id,
      type: "subscription_upcoming_delivery",
    }).lean();
    expect(notice).toBeTruthy();
  });

  it("is idempotent for duplicate invoice.payment_succeeded events", async () => {
    const customer = await createCustomer();
    const { product, variant } = await createProductAndVariant();
    const nextDelivery = new Date("2026-07-19T09:00:00.000Z");

    const subscription = await Subscription.create({
      subscriptionNumber: `SUB-TEST-${crypto.randomUUID().slice(0, 8)}`,
      customer: customer._id,
      frequency: "weekly",
      preferredDeliveryDay: 0,
      preferredDeliveryDays: [0],
      nextDeliveryDate: nextDelivery,
      startDate: new Date("2026-07-01T10:00:00.000Z"),
      deliveryAddress: {
        line1: "2 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
      },
      items: [buildSubscriptionItem(product, variant, 1)],
      status: "active",
      stripeSubscriptionId: "sub_test_webhook_idem_1",
      stripeProductId: "prod_test_sub",
      stripePriceId: "price_test_sub",
    });

    await SubscriptionDelivery.create({
      subscription: subscription._id,
      customer: customer._id,
      scheduledDate: nextDelivery,
      status: "scheduled",
    });

    const eventBody = {
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_test_idem_1",
          subscription: "sub_test_webhook_idem_1",
          billing_reason: "subscription_cycle",
          payment_intent: "pi_test_idem_1",
          status_transitions: { paid_at: 1784451600 },
        },
      },
    };

    const first = await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "test_sig")
      .send(eventBody);
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "test_sig")
      .send(eventBody);
    expect(second.status).toBe(200);

    const orders = await Order.find({
      subscription: subscription._id,
      stripeInvoiceId: "in_test_idem_1",
    }).lean();

    expect(orders).toHaveLength(1);
  });

  it("promotes eligible pendingChanges before creating the paid delivery order", async () => {
    const customer = await createCustomer();
    const { product, variant } = await createProductAndVariant();
    const nextDelivery = new Date("2026-07-26T09:00:00.000Z");

    const currentItems = [buildSubscriptionItem(product, variant, 1)];
    const stagedItems = [buildSubscriptionItem(product, variant, 3)];

    const subscription = await Subscription.create({
      subscriptionNumber: `SUB-TEST-${crypto.randomUUID().slice(0, 8)}`,
      customer: customer._id,
      frequency: "weekly",
      preferredDeliveryDay: 0,
      preferredDeliveryDays: [0],
      nextDeliveryDate: nextDelivery,
      startDate: new Date("2026-07-01T10:00:00.000Z"),
      deliveryAddress: {
        line1: "3 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
      },
      items: currentItems,
      pendingChanges: {
        items: stagedItems,
        effectiveFrom: new Date("2026-07-20T00:00:00.000Z"),
      },
      status: "active",
      stripeSubscriptionId: "sub_test_webhook_pending_1",
      stripeProductId: "prod_test_sub",
      stripePriceId: "price_test_sub",
    });

    await SubscriptionDelivery.create({
      subscription: subscription._id,
      customer: customer._id,
      scheduledDate: nextDelivery,
      status: "scheduled",
    });

    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "test_sig")
      .send({
        type: "invoice.payment_succeeded",
        data: {
          object: {
            id: "in_test_pending_1",
            subscription: "sub_test_webhook_pending_1",
            billing_reason: "subscription_cycle",
            payment_intent: "pi_test_pending_1",
            status_transitions: { paid_at: 1785056400 },
          },
        },
      });

    expect(res.status).toBe(200);

    const order = await Order.findOne({
      subscription: subscription._id,
      stripeInvoiceId: "in_test_pending_1",
    }).lean();

    expect(order).toBeTruthy();
    expect(order.items[0].quantity).toBe(3);

    const updatedSub = await Subscription.findById(subscription._id).lean();
    expect(updatedSub.pendingChanges).toBeNull();
    expect(updatedSub.items[0].quantity).toBe(3);
  });

  it("retains pendingChanges when effectiveFrom is after the current delivery", async () => {
    const customer = await createCustomer();
    const { product, variant } = await createProductAndVariant();
    const nextDelivery = new Date("2026-08-02T09:00:00.000Z");

    const subscription = await createSubscriptionFixture({
      customer: customer._id,
      stripeSubscriptionId: "sub_test_webhook_pending_later_1",
      nextDeliveryDate: nextDelivery,
      items: [buildSubscriptionItem(product, variant, 1)],
      pendingChanges: {
        items: [buildSubscriptionItem(product, variant, 4)],
        effectiveFrom: new Date("2026-08-10T00:00:00.000Z"),
      },
    });

    await SubscriptionDelivery.create({
      subscription: subscription._id,
      customer: customer._id,
      scheduledDate: nextDelivery,
      status: "scheduled",
    });

    const res = await postStripeEvent({
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_test_pending_later_1",
          subscription: "sub_test_webhook_pending_later_1",
          payment_intent: "pi_test_pending_later_1",
          status_transitions: { paid_at: 1785661200 },
        },
      },
    });

    expect(res.status).toBe(200);

    const order = await Order.findOne({
      subscription: subscription._id,
      stripeInvoiceId: "in_test_pending_later_1",
    }).lean();
    expect(order.items[0].quantity).toBe(1);

    const updatedSub = await Subscription.findById(subscription._id).lean();
    expect(updatedSub.pendingChanges).toBeTruthy();
    expect(updatedSub.pendingChanges.items[0].quantity).toBe(4);
  });

  it("pauses subscription and creates payment_failed notification on invoice.payment_failed", async () => {
    const customer = await createCustomer();
    const { product, variant } = await createProductAndVariant();

    const subscription = await createSubscriptionFixture({
      customer: customer._id,
      stripeSubscriptionId: "sub_test_webhook_payment_failed_1",
      nextDeliveryDate: new Date("2026-08-09T09:00:00.000Z"),
      items: [buildSubscriptionItem(product, variant, 1)],
    });

    const res = await postStripeEvent({
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_test_payment_failed_1",
          subscription: "sub_test_webhook_payment_failed_1",
        },
      },
    });

    expect(res.status).toBe(200);

    const notification = await CustomerNotification.findOne({
      customer: customer._id,
      type: "payment_failed",
    }).lean();
    expect(notification).toBeTruthy();

    const updated = await Subscription.findById(subscription._id).lean();
    expect(updated.status).toBe("paused");
    expect(updated.pausedAt).toBeTruthy();
  });

  it("pauses subscription on payment_failed; order still created if invoice later succeeds", async () => {
    const customer = await createCustomer();
    const { product, variant } = await createProductAndVariant();
    const nextDelivery = new Date("2026-08-16T09:00:00.000Z");

    const subscription = await createSubscriptionFixture({
      customer: customer._id,
      stripeSubscriptionId: "sub_test_webhook_retry_success_1",
      nextDeliveryDate: nextDelivery,
      items: [buildSubscriptionItem(product, variant, 1)],
    });

    await SubscriptionDelivery.create({
      subscription: subscription._id,
      customer: customer._id,
      scheduledDate: nextDelivery,
      status: "scheduled",
    });

    const failed = await postStripeEvent({
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_test_retry_1",
          subscription: "sub_test_webhook_retry_success_1",
        },
      },
    });
    expect(failed.status).toBe(200);

    const paused = await Subscription.findById(subscription._id).lean();
    expect(paused.status).toBe("paused");

    // If Stripe fires invoice.payment_succeeded (e.g. manual payment capture), an
    // order is still created so the delivery is fulfilled.
    const success = await postStripeEvent({
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_test_retry_1",
          subscription: "sub_test_webhook_retry_success_1",
          payment_intent: "pi_test_retry_1",
          status_transitions: { paid_at: 1786870800 },
        },
      },
    });
    expect(success.status).toBe(200);

    const order = await Order.findOne({
      subscription: subscription._id,
      stripeInvoiceId: "in_test_retry_1",
    }).lean();
    expect(order).toBeTruthy();
  });

  it("ignores invoice.payment_succeeded without subscription id", async () => {
    const res = await postStripeEvent({
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_test_non_subscription_1",
          payment_intent: "pi_test_non_subscription_1",
        },
      },
    });

    expect(res.status).toBe(200);
    const orders = await Order.find({
      stripeInvoiceId: "in_test_non_subscription_1",
    }).lean();
    expect(orders).toHaveLength(0);
  });

  it("handles unknown local subscription gracefully", async () => {
    const res = await postStripeEvent({
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_test_unknown_sub_1",
          subscription: "sub_test_unknown_local_1",
          payment_intent: "pi_test_unknown_sub_1",
        },
      },
    });

    expect(res.status).toBe(200);
    const orders = await Order.find({
      stripeInvoiceId: "in_test_unknown_sub_1",
    }).lean();
    expect(orders).toHaveLength(0);
  });

  it("handles missing populated customer gracefully", async () => {
    const { product, variant } = await createProductAndVariant();
    const nextDelivery = new Date("2026-08-23T09:00:00.000Z");

    await createSubscriptionFixture({
      customer: new mongoose.Types.ObjectId(),
      stripeSubscriptionId: "sub_test_no_customer_1",
      nextDeliveryDate: nextDelivery,
      items: [buildSubscriptionItem(product, variant, 1)],
    });

    const res = await postStripeEvent({
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_test_no_customer_1",
          subscription: "sub_test_no_customer_1",
          payment_intent: "pi_test_no_customer_1",
        },
      },
    });

    expect(res.status).toBe(200);
    const orders = await Order.find({
      stripeInvoiceId: "in_test_no_customer_1",
    }).lean();
    expect(orders).toHaveLength(0);
  });

  it("syncs subscription status on customer.subscription.updated", async () => {
    const customer = await createCustomer();
    const { product, variant } = await createProductAndVariant();

    const subscription = await createSubscriptionFixture({
      customer: customer._id,
      stripeSubscriptionId: "sub_test_status_update_1",
      nextDeliveryDate: new Date("2026-08-30T09:00:00.000Z"),
      items: [buildSubscriptionItem(product, variant, 1)],
      status: "active",
    });

    const paused = await postStripeEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_test_status_update_1",
          status: "active",
          pause_collection: { behavior: "void" },
        },
      },
    });
    expect(paused.status).toBe(200);

    const afterPaused = await Subscription.findById(subscription._id).lean();
    expect(afterPaused.status).toBe("paused");

    const resumed = await postStripeEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_test_status_update_1",
          status: "active",
          pause_collection: null,
        },
      },
    });
    expect(resumed.status).toBe(200);

    const afterResumed = await Subscription.findById(subscription._id).lean();
    expect(afterResumed.status).toBe("active");

    const cancelled = await postStripeEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_test_status_update_1",
          status: "canceled",
          pause_collection: null,
        },
      },
    });
    expect(cancelled.status).toBe(200);

    const afterCancelled = await Subscription.findById(subscription._id).lean();
    expect(afterCancelled.status).toBe("cancelled");
  });

  it("cancels local subscription and scheduled deliveries on customer.subscription.deleted", async () => {
    const customer = await createCustomer();
    const { product, variant } = await createProductAndVariant();

    const subscription = await createSubscriptionFixture({
      customer: customer._id,
      stripeSubscriptionId: "sub_test_deleted_1",
      nextDeliveryDate: new Date("2026-09-06T09:00:00.000Z"),
      items: [buildSubscriptionItem(product, variant, 1)],
      status: "active",
    });

    await SubscriptionDelivery.create([
      {
        subscription: subscription._id,
        customer: customer._id,
        scheduledDate: new Date("2026-09-06T09:00:00.000Z"),
        status: "scheduled",
      },
      {
        subscription: subscription._id,
        customer: customer._id,
        scheduledDate: new Date("2026-09-09T09:00:00.000Z"),
        status: "scheduled",
      },
    ]);

    const res = await postStripeEvent({
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_test_deleted_1",
        },
      },
    });
    expect(res.status).toBe(200);

    const updatedSub = await Subscription.findById(subscription._id).lean();
    expect(updatedSub.status).toBe("cancelled");

    const deliveries = await SubscriptionDelivery.find({
      subscription: subscription._id,
    }).lean();
    expect(deliveries.every((slot) => slot.status === "cancelled")).toBe(true);
  });

  it("falls back to default location when geocoding fails", async () => {
    geocode.geocodeAddress.mockImplementationOnce(async () => {
      throw new Error("Geocode failed");
    });

    const customer = await createCustomer();
    const { product, variant } = await createProductAndVariant();
    const nextDelivery = new Date("2026-09-13T09:00:00.000Z");

    const subscription = await createSubscriptionFixture({
      customer: customer._id,
      stripeSubscriptionId: "sub_test_geocode_fail_1",
      nextDeliveryDate: nextDelivery,
      items: [buildSubscriptionItem(product, variant, 1)],
    });

    await SubscriptionDelivery.create({
      subscription: subscription._id,
      customer: customer._id,
      scheduledDate: nextDelivery,
      status: "scheduled",
    });

    const res = await postStripeEvent({
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_test_geocode_fail_1",
          subscription: "sub_test_geocode_fail_1",
          payment_intent: "pi_test_geocode_fail_1",
        },
      },
    });
    expect(res.status).toBe(200);

    const order = await Order.findOne({
      stripeInvoiceId: "in_test_geocode_fail_1",
      subscription: subscription._id,
    }).lean();
    expect(order).toBeTruthy();
    expect(order.location).toEqual({ lat: 0, lng: 0 });
  });

  it("clears pendingPriceSync after paid invoice processing", async () => {
    const customer = await createCustomer();
    const { product, variant } = await createProductAndVariant();
    const nextDelivery = new Date("2026-09-20T09:00:00.000Z");

    const subscription = await createSubscriptionFixture({
      customer: customer._id,
      stripeSubscriptionId: "sub_test_pending_price_sync_1",
      nextDeliveryDate: nextDelivery,
      items: [buildSubscriptionItem(product, variant, 1)],
      pendingPriceSync: true,
    });

    await SubscriptionDelivery.create({
      subscription: subscription._id,
      customer: customer._id,
      scheduledDate: nextDelivery,
      status: "scheduled",
    });

    const res = await postStripeEvent({
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_test_pending_price_sync_1",
          subscription: "sub_test_pending_price_sync_1",
          payment_intent: "pi_test_pending_price_sync_1",
        },
      },
    });
    expect(res.status).toBe(200);

    const updatedSub = await Subscription.findById(subscription._id).lean();
    expect(updatedSub.pendingPriceSync).toBe(false);
  });

  it("re-resolves new invoice shape to legacy invoice before processing", async () => {
    const customer = await createCustomer();
    const { product, variant } = await createProductAndVariant();
    const nextDelivery = new Date("2026-09-27T09:00:00.000Z");

    const subscription = await createSubscriptionFixture({
      customer: customer._id,
      stripeSubscriptionId: "sub_test_resolve_legacy_1",
      nextDeliveryDate: nextDelivery,
      items: [buildSubscriptionItem(product, variant, 1)],
    });

    await SubscriptionDelivery.create({
      subscription: subscription._id,
      customer: customer._id,
      scheduledDate: nextDelivery,
      status: "scheduled",
    });

    stripe.invoices.retrieve.mockResolvedValueOnce({
      id: "in_test_resolve_legacy_1",
      subscription: "sub_test_resolve_legacy_1",
      payment_intent: "pi_test_resolve_legacy_1",
      status_transitions: { paid_at: 1790499600 },
    });

    const res = await postStripeEvent({
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_test_resolve_legacy_1",
          // Intentionally missing top-level subscription to mimic new shape.
          parent: {
            subscription_details: { subscription: "sub_test_resolve_legacy_1" },
          },
        },
      },
    });

    expect(res.status).toBe(200);
    expect(stripe.invoices.retrieve).toHaveBeenCalledWith(
      "in_test_resolve_legacy_1",
    );

    const order = await Order.findOne({
      subscription: subscription._id,
      stripeInvoiceId: "in_test_resolve_legacy_1",
    }).lean();
    expect(order).toBeTruthy();
  });
});
