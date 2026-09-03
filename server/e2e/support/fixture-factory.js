"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");

const Customer = require("../../models/customer.model");
const Order = require("../../models/order.model");
const PaymentMethod = require("../../models/paymentMethod.model");
const Product = require("../../models/product.model");
const ProductVariant = require("../../models/variant.model");
const Review = require("../../models/review.model");
const StoreCreditTransaction = require("../../models/storeCreditTransaction.model");
const Subscription = require("../../models/subscription.model");
const SubscriptionDelivery = require("../../models/subscriptionDelivery.model");
const SubscriptionSettings = require("../../models/subscriptionSettings.model");
const passwordUtil = require("../../utils/password.util");
const stripe = require("../../utils/stripe.util");
const subscriptionService = require("../../services/customerPortal/customerSubscriptions.service");
const { API_ORIGIN } = require("./constants");

const SUCCESS_METHOD = "pm_card_visa";
const DECLINING_METHOD = "pm_card_chargeCustomerFail";
const BASE_PASSWORD = "RealStripeE2E1";
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const tracked = {
  clocks: new Set(),
  customers: new Set(),
  localCustomers: new Set(),
  products: new Set(),
  fixtures: new Map(),
};

function idOf(value) {
  return String(value || "");
}

function atOffset(days, hour = 9) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

function cadenceConfig(cadence, timing) {
  const after = timing === "after-cutoff" || timing === "resume-locked";

  if (cadence === "weekly-multi-day") {
    const offsets = after ? [1, 4, 8] : [4, 6, 11];
    const dates = offsets.map((offset) => atOffset(offset));
    return {
      cadence,
      frequency: "weekly",
      dates,
      deliveryDays: [dates[0].getDay(), dates[1].getDay()],
      paidDeliveryCount: 2,
    };
  }

  const firstOffset = after ? 1 : 4;
  const intervalDays = cadence === "fortnightly" ? 14 : 7;
  const dates = [0, 1, 2].map((index) =>
    atOffset(firstOffset + index * intervalDays),
  );
  return {
    cadence,
    frequency: cadence === "fortnightly" ? "every_two_weeks" : "weekly",
    dates,
    deliveryDays: [dates[0].getDay()],
    paidDeliveryCount: 1,
  };
}

function orderItems(items) {
  return items.map((item) => ({
    product: item.product,
    variant: item.variant,
    name: item.name,
    sku: item.sku,
    price: item.unitPrice,
    quantity: item.quantity,
    subtotal: Number(item.unitPrice) * Number(item.quantity),
  }));
}

function totalMajor(items) {
  return items.reduce(
    (total, item) =>
      total + Number(item.unitPrice || item.price) * Number(item.quantity),
    0,
  );
}

function buildPreparedDraft(options, config, variants, addressId) {
  if (options.preparedDraft !== "split-multi-day") return null;

  const [firstDay, secondDay] = config.deliveryDays;
  const firstDayName = DAY_NAMES[firstDay];
  const secondDayName = DAY_NAMES[secondDay];

  if (!firstDayName || !secondDayName) {
    throw new Error("Prepared draft fixture requires valid delivery day names");
  }

  return {
    step: 5,
    selectedVariantIds: [
      String(variants.MILK._id),
      String(variants.BUTTER._id),
      String(variants.EGGS._id),
    ],
    quantities: {
      [String(variants.MILK._id)]: 1,
      [String(variants.BUTTER._id)]: 2,
      [String(variants.EGGS._id)]: 1,
    },
    dayQuantities: {
      [firstDayName]: {
        [String(variants.MILK._id)]: 1,
        [String(variants.BUTTER._id)]: 2,
      },
      [secondDayName]: {
        [String(variants.EGGS._id)]: 1,
      },
    },
    frequency: "weekly",
    deliveryDays: [firstDayName, secondDayName],
    selectedAddress: addressId,
    preparedByAdmin: true,
  };
}

async function clearDatabase() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

async function deleteClock(clockId) {
  try {
    await stripe.testHelpers.testClocks.del(clockId);
  } catch (error) {
    if (!/No such test_clock|already deleted/i.test(error?.message || "")) {
      throw error;
    }
  }
}

async function discoverTrackedProducts() {
  if (!tracked.localCustomers.size) return;

  let startingAfter;
  do {
    const page = await stripe.products.list({
      active: true,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const product of page.data) {
      if (tracked.localCustomers.has(idOf(product.metadata?.customerId))) {
        tracked.products.add(product.id);
      }
    }
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  } while (startingAfter);
}

async function cleanupStripe() {
  const errors = [];

  try {
    await discoverTrackedProducts();
  } catch (error) {
    errors.push(`product discovery: ${error.message}`);
  }

  for (const clockId of [...tracked.clocks]) {
    try {
      await deleteClock(clockId);
      tracked.clocks.delete(clockId);
    } catch (error) {
      errors.push(`clock ${clockId}: ${error.message}`);
    }
  }

  for (const customerId of [...tracked.customers]) {
    try {
      await stripe.customers.del(customerId);
      tracked.customers.delete(customerId);
    } catch (error) {
      if (!/No such customer/i.test(error?.message || "")) {
        errors.push(`customer ${customerId}: ${error.message}`);
      } else {
        tracked.customers.delete(customerId);
      }
    }
  }

  for (const productId of [...tracked.products]) {
    try {
      await stripe.products.update(productId, { active: false });
      tracked.products.delete(productId);
    } catch (error) {
      if (!/No such product/i.test(error?.message || "")) {
        errors.push(`product ${productId}: ${error.message}`);
      } else {
        tracked.products.delete(productId);
      }
    }
  }

  if (errors.length) {
    throw new Error(`Stripe E2E cleanup failed: ${errors.join("; ")}`);
  }

  tracked.localCustomers.clear();
  tracked.fixtures.clear();
}

async function reset() {
  global.__E2E_EMAIL_OUTBOX__ = [];
  if (mongoose.connection.readyState === 1) {
    const localProductIds = await Subscription.distinct("stripeProductId", {
      stripeProductId: { $nin: [null, ""] },
    });
    localProductIds.forEach((productId) => tracked.products.add(productId));
  }
  await cleanupStripe();
  await clearDatabase();
}

async function createCatalog(scenarioId) {
  const definitions = [
    ["Whole Milk", "MILK", 5],
    ["Cultured Butter", "BUTTER", 3],
    ["Farm Eggs", "EGGS", 2],
  ];
  const variants = {};

  for (const [name, key, price] of definitions) {
    const product = await Product.create({
      name: `E2E ${name} ${scenarioId}`,
      slug: `e2e-${key.toLowerCase()}-${scenarioId}`,
      category: "e2e-subscriptions",
      description: "Isolated real-Stripe customer portal E2E fixture",
      status: "active",
      isSubscriptionEligible: true,
      thumbnailImage: new mongoose.Types.ObjectId(),
    });
    const variant = await ProductVariant.create({
      product: product._id,
      name: "Standard",
      sku: `E2E-${key}-${scenarioId}`,
      price,
      stockQuantity: 10_000,
      status: "active",
    });
    variant.product = product;
    variants[key] = variant;
  }

  return variants;
}

async function attachMethod(stripeCustomerId, paymentMethodId) {
  let attachedMethodId = paymentMethodId;
  try {
    const attached = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: stripeCustomerId,
    });
    // Stripe's reusable test aliases (for example pm_card_visa) are cloned
    // into a customer-specific pm_... object when attached. Always persist the
    // returned ID; setting the alias itself as default creates a different,
    // unattached clone on newer Stripe API versions.
    attachedMethodId = attached.id;
  } catch (error) {
    if (!/already been attached to this Customer/i.test(error?.message || "")) {
      throw error;
    }
  }

  await stripe.customers.update(stripeCustomerId, {
    invoice_settings: { default_payment_method: attachedMethodId },
  });
  return attachedMethodId;
}

async function createCustomer(
  scenarioId,
  { withPaymentMethod = true, subscriptionUpdates = true } = {},
) {
  let clock = null;
  if (process.env.E2E_USE_TEST_CLOCKS !== "0") {
    clock = await stripe.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
      name: `levants-e2e-${scenarioId}`.slice(0, 250),
    });
    tracked.clocks.add(clock.id);
  }

  const remoteCustomer = await stripe.customers.create({
    email: `stripe-e2e-${scenarioId}@example.com`,
    name: `Levants E2E ${scenarioId}`,
    ...(clock ? { test_clock: clock.id } : {}),
    metadata: {
      e2e: "true",
      e2eScenario: scenarioId,
    },
  });
  if (!clock) tracked.customers.add(remoteCustomer.id);
  const attachedSuccessMethodId = withPaymentMethod
    ? await attachMethod(remoteCustomer.id, SUCCESS_METHOD)
    : null;

  const email = `portal-e2e-${scenarioId}@example.com`;
  const passwordHash = await passwordUtil.hashPassword(BASE_PASSWORD);
  const customer = await Customer.create({
    firstName: "Stripe",
    lastName: "E2E",
    email,
    passwordHash,
    isGuest: false,
    status: "active",
    emailVerifiedAt: new Date(),
    stripeCustomerId: remoteCustomer.id,
    notificationPreferences: {
      subscriptionUpdates,
    },
    addresses: [
      {
        label: "E2E Home",
        fullName: "Stripe E2E",
        line1: "1 Subscription Test Lane",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
        isDefault: true,
      },
    ],
  });
  tracked.localCustomers.add(String(customer._id));

  const method = attachedSuccessMethodId
    ? await PaymentMethod.create({
        customer: customer._id,
        type: "card",
        provider: "stripe",
        providerReference: attachedSuccessMethodId,
        isDefault: true,
      })
    : null;

  return {
    clock,
    customer,
    remoteCustomer,
    method,
    email,
    password: BASE_PASSWORD,
  };
}

function resolveInvoicePaymentIntent(invoice) {
  const legacy = invoice?.payment_intent;
  if (typeof legacy === "string") return legacy;
  if (legacy?.id) return legacy.id;

  const payment = invoice?.payments?.data?.find(
    (entry) => entry?.payment?.payment_intent,
  )?.payment?.payment_intent;
  return typeof payment === "string" ? payment : payment?.id || null;
}

async function retrieveInitialInvoice(stripeSubscriptionId) {
  const remoteSubscription = await stripe.subscriptions.retrieve(
    stripeSubscriptionId,
    { expand: ["latest_invoice.payment_intent"] },
  );
  const latestInvoice = remoteSubscription.latest_invoice;
  const invoice =
    typeof latestInvoice === "string"
      ? await stripe.invoices.retrieve(latestInvoice, {
          expand: ["payment_intent"],
        })
      : latestInvoice;
  if (!invoice?.id) throw new Error("Stripe did not return an initial invoice");

  const paymentIntentId = resolveInvoicePaymentIntent(invoice);
  if (!paymentIntentId) {
    throw new Error(
      `Initial Stripe invoice ${invoice.id} has no resolved PaymentIntent`,
    );
  }
  return { invoice, paymentIntentId };
}

async function waitForSignedInitialInvoiceWebhook(invoiceId) {
  if (process.env.E2E_USE_STRIPE_CLI !== "1") return;

  const timeoutAt = Date.now() + 30_000;
  while (Date.now() < timeoutAt) {
    if (
      global.__E2E_COMPLETED_SIGNED_INVOICE_WEBHOOKS__?.has(String(invoiceId))
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `Signed invoice webhook did not complete for ${invoiceId} within 30 seconds`,
  );
}

function planForDay(subscription, day) {
  const plan = subscription.deliveryDayPlans?.find(
    (candidate) => Number(candidate.day) === Number(day),
  );
  return plan?.items?.length ? plan.items : subscription.items;
}

async function replaceDeliverySchedule({
  subscription,
  config,
  invoice,
  paymentIntentId,
  createPaidOrders,
}) {
  await SubscriptionDelivery.deleteMany({ subscription: subscription._id });
  await Order.deleteMany({ subscription: subscription._id });

  subscription.nextDeliveryDate = config.dates[0];
  await subscription.save();

  const deliveries = [];
  const orders = [];
  for (const [index, scheduledDate] of config.dates.entries()) {
    const isPaid = createPaidOrders && index < config.paidDeliveryCount;
    const delivery = await SubscriptionDelivery.create({
      subscription: subscription._id,
      customer: subscription.customer,
      scheduledDate,
      status: isPaid ? "generated" : "scheduled",
      generatedAt: isPaid ? new Date() : null,
    });
    deliveries.push(delivery);

    if (!isPaid) continue;

    const sourceItems = planForDay(subscription, scheduledDate.getDay());
    const items = orderItems(sourceItems);
    const subtotal = totalMajor(sourceItems);
    const deliveryFee = 1;
    const total = subtotal + deliveryFee;
    const order = await Order.create({
      customer: subscription.customer,
      items,
      currency: "GBP",
      subtotal,
      deliveryAddress: subscription.deliveryAddress,
      deliveryDate: scheduledDate,
      customerInstructions: "",
      location: { lat: 51.5074, lng: -0.1278 },
      deliveryFee,
      total,
      status: "paid",
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(Date.now() + DAY_MS),
      stripePaymentIntentId: paymentIntentId,
      stripeInvoiceId: invoice.id,
      paidAt: new Date(),
      amountPaid: total,
      orderType: "subscription_generated",
      subscription: subscription._id,
    });
    delivery.order = order._id;
    await delivery.save();
    orders.push(order);
  }

  return { deliveries, orders };
}

async function createFixture(options = {}) {
  const scenarioId = `${Date.now().toString(36)}-${crypto
    .randomUUID()
    .slice(0, 8)}`;
  const cadence = options.cadence || "weekly-single-day";
  const timing = options.timing || "before-cutoff";
  const config = cadenceConfig(cadence, timing);
  if (options.portalCreationDays === true) {
    // The customer creation form deliberately offers the business delivery
    // days only. Keep UI fixtures deterministic instead of deriving an
    // unsupported weekday from today's date.
    config.deliveryDays = [0, 3];
  }

  await SubscriptionSettings.findOneAndUpdate(
    { singletonKey: "subscription-settings" },
    {
      singletonKey: "subscription-settings",
      deliveryDays: config.deliveryDays,
      cutoffDaysBefore: 2,
      cutoffTime: "22:00",
    },
    { upsert: true, new: true },
  );

  const variants = await createCatalog(scenarioId);
  if (options.addOnStock !== undefined) {
    variants.EGGS.stockQuantity = Number(options.addOnStock);
    await variants.EGGS.save();
  }
  const customerData = await createCustomer(scenarioId, {
    withPaymentMethod: options.withPaymentMethod !== false,
    subscriptionUpdates: options.subscriptionUpdates !== false,
  });
  const addressId = customerData.customer.addresses[0]._id.toString();

  const preparedDraft = buildPreparedDraft(
    options,
    config,
    variants,
    addressId,
  );
  if (preparedDraft) {
    customerData.customer.pendingSubscriptionDraft = preparedDraft;
    await customerData.customer.save();
  }

  if (options.createSubscription === false) {
    const fixture = {
      scenarioId,
      cadence,
      timing,
      credentials: {
        email: customerData.email,
        password: customerData.password,
      },
      customerId: String(customerData.customer._id),
      addressId,
      paymentMethodId: customerData.method
        ? String(customerData.method._id)
        : null,
      stripeCustomerId: customerData.remoteCustomer.id,
      preparedDraft,
      deliveryDays: config.deliveryDays,
      variants: Object.fromEntries(
        Object.entries(variants).map(([key, variant]) => [
          key,
          {
            id: String(variant._id),
            productId: String(variant.product._id),
            name: variant.product.name,
            price: variant.price,
          },
        ]),
      ),
    };
    return fixture;
  }

  const baseItems = [
    { variantId: String(variants.MILK._id), quantity: 2 },
    { variantId: String(variants.BUTTER._id), quantity: 1 },
  ];
  const isMulti = cadence === "weekly-multi-day";
  let result;
  try {
    result = await subscriptionService.CreateSubscription({
      customerId: customerData.customer._id,
      frequency: config.frequency,
      preferredDeliveryDay: config.deliveryDays[0],
      preferredDeliveryDays: config.deliveryDays,
      deliveryAddressId: addressId,
      ...(isMulti
        ? {
            deliveryDayPlans: config.deliveryDays.map((day) => ({
              day,
              items: baseItems,
            })),
          }
        : { items: baseItems }),
      notes: `Real Stripe E2E ${scenarioId}`,
    });
  } catch (error) {
    await discoverTrackedProducts().catch(() => {});
    throw error;
  }
  if (!result.success) {
    await discoverTrackedProducts().catch(() => {});
    throw new Error(`Subscription fixture creation failed: ${result.message}`);
  }

  const subscription = await Subscription.findById(
    result.data.subscription._id,
  );
  tracked.products.add(subscription.stripeProductId);
  const { invoice, paymentIntentId } = await retrieveInitialInvoice(
    subscription.stripeSubscriptionId,
  );
  await waitForSignedInitialInvoiceWebhook(invoice.id);
  let resumeRequiredMinor = 0;
  let resumeFundingRefundId = null;
  if (options.resumeRequiresPayment) {
    const invoicePaidMinor = Number(invoice.amount_paid || invoice.total || 0);
    resumeRequiredMinor = options.resumeRefundMinor
      ? Math.min(Number(options.resumeRefundMinor), invoicePaidMinor)
      : invoicePaidMinor;
    if (resumeRequiredMinor <= 0 || invoicePaidMinor <= 0) {
      throw new Error("Resume-payment fixture requires a paid Stripe invoice");
    }
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: resumeRequiredMinor,
      metadata: {
        e2e: "true",
        subscriptionId: String(subscription._id),
        type: "resume_funding_reset",
      },
    });
    resumeFundingRefundId = refund.id;
  }
  const createPaidOrders = options.lifecycle !== "resume";
  const { deliveries, orders } = await replaceDeliverySchedule({
    subscription,
    config,
    invoice,
    paymentIntentId,
    createPaidOrders,
  });

  if (options.withoutUpcomingDeliveries === true) {
    await Promise.all([
      SubscriptionDelivery.deleteMany({ subscription: subscription._id }),
      Order.deleteMany({ subscription: subscription._id }),
    ]);
    deliveries.splice(0, deliveries.length);
    orders.splice(0, orders.length);
  }

  if (options.lifecycle === "resume") {
    const selectedResumeDate = atOffset(
      options.pauseStillActive === true ? 10 : -1,
    );
    const previousDeliveryDate = new Date(config.dates[0]);
    previousDeliveryDate.setDate(
      previousDeliveryDate.getDate() + (cadence === "fortnightly" ? -14 : -7),
    );
    const previousDelivery = await SubscriptionDelivery.create({
      subscription: subscription._id,
      customer: subscription.customer,
      scheduledDate: previousDeliveryDate,
      status: "cancelled",
    });
    deliveries.unshift(previousDelivery);
    subscription.status = "paused";
    subscription.pausedAt = atOffset(-2);
    subscription.pausedUntil = selectedResumeDate;
    await subscription.save();
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      pause_collection: { behavior: "void" },
    });
  }

  if (options.funds === "insufficient") {
    await attachMethod(customerData.remoteCustomer.id, DECLINING_METHOD);
  }
  if (options.withoutDefaultPaymentMethod === true) {
    await stripe.customers.update(customerData.remoteCustomer.id, {
      invoice_settings: { default_payment_method: "" },
    });
  }

  const reloaded = await Subscription.findById(subscription._id).lean();
  const itemByVariant = new Map(
    reloaded.items.map((item) => [String(item.variant), String(item._id)]),
  );
  const fixture = {
    scenarioId,
    cadence,
    timing,
    frequency: config.frequency,
    credentials: {
      email: customerData.email,
      password: customerData.password,
    },
    customerId: String(customerData.customer._id),
    addressId,
    paymentMethodId: customerData.method
      ? String(customerData.method._id)
      : null,
    stripeCustomerId: customerData.remoteCustomer.id,
    stripeSubscriptionId: subscription.stripeSubscriptionId,
    stripeProductId: subscription.stripeProductId,
    stripePriceId: subscription.stripePriceId,
    initialInvoiceId: invoice.id,
    initialPaymentIntentId: paymentIntentId,
    resumeRequiredMinor,
    resumeFundingRefundId,
    subscriptionId: String(subscription._id),
    subscriptionNumber: subscription.subscriptionNumber,
    deliveryDays: config.deliveryDays,
    deliveryDates: config.dates.map((date) => date.toISOString()),
    lockedDeliveryDate:
      timing === "after-cutoff" || timing === "resume-locked"
        ? config.dates[0].toISOString()
        : null,
    firstOpenDeliveryDate:
      timing === "after-cutoff" || timing === "resume-locked"
        ? config.dates[1].toISOString()
        : config.dates[0].toISOString(),
    selectedResumeDate: reloaded.pausedUntil
      ? new Date(reloaded.pausedUntil).toISOString()
      : null,
    resumeOn: atOffset(10).toISOString().slice(0, 10),
    variants: {
      MILK: {
        id: String(variants.MILK._id),
        productId: String(variants.MILK.product._id),
        name: variants.MILK.product.name,
        price: variants.MILK.price,
        itemId: itemByVariant.get(String(variants.MILK._id)),
      },
      BUTTER: {
        id: String(variants.BUTTER._id),
        productId: String(variants.BUTTER.product._id),
        name: variants.BUTTER.product.name,
        price: variants.BUTTER.price,
        itemId: itemByVariant.get(String(variants.BUTTER._id)),
      },
      EGGS: {
        id: String(variants.EGGS._id),
        productId: String(variants.EGGS.product._id),
        name: variants.EGGS.product.name,
        price: variants.EGGS.price,
        itemId: null,
      },
    },
    expectedDeltaMinor: {
      "add-item": 200,
      "increase-existing-item-quantity": 500,
      "remove-item": 300,
      "decrease-quantity": 500,
    },
    paidDeliveryCount: orders.length,
    deliveryIds: deliveries.map((delivery) => String(delivery._id)),
  };
  tracked.fixtures.set(fixture.subscriptionId, fixture);
  return fixture;
}

async function setPaymentOutcome(subscriptionId, outcome) {
  const fixture = tracked.fixtures.get(String(subscriptionId));
  if (!fixture) throw new Error("Unknown E2E subscription fixture");
  const paymentMethodId =
    outcome === "insufficient" ? DECLINING_METHOD : SUCCESS_METHOD;
  const attachedPaymentMethodId = await attachMethod(
    fixture.stripeCustomerId,
    paymentMethodId,
  );
  return { outcome, paymentMethodId: attachedPaymentMethodId };
}

async function preparePaymentRetry(subscriptionId) {
  const fixture = tracked.fixtures.get(String(subscriptionId));
  if (!fixture) throw new Error("Unknown E2E subscription fixture");

  const subscription = await Subscription.findById(subscriptionId);
  const delivery = await SubscriptionDelivery.findOne({
    subscription: subscriptionId,
    status: "scheduled",
  }).sort({ scheduledDate: 1 });
  if (!subscription || !delivery) {
    throw new Error("Payment-retry fixture requires a scheduled delivery");
  }

  subscription.nextDeliveryDate = delivery.scheduledDate;
  await subscription.save();

  return {
    invoiceId: `in_e2e_retry_${fixture.scenarioId.replace(/[^a-z0-9]/gi, "")}`,
    deliveryDate: delivery.scheduledDate,
  };
}

async function deliverSignedInvoiceEvent(subscriptionId, type, invoiceId) {
  const fixture = tracked.fixtures.get(String(subscriptionId));
  if (!fixture) throw new Error("Unknown E2E subscription fixture");
  if (!["invoice.payment_failed", "invoice.payment_succeeded"].includes(type)) {
    throw new Error(`Unsupported E2E invoice event ${type}`);
  }

  const payload = JSON.stringify({
    id: `evt_e2e_${crypto.randomUUID().replace(/-/g, "")}`,
    object: "event",
    type,
    data: {
      object: {
        id: invoiceId,
        object: "invoice",
        subscription: fixture.stripeSubscriptionId,
        currency: "gbp",
        ...(type === "invoice.payment_succeeded"
          ? {
              payment_intent: `pi_e2e_retry_${fixture.scenarioId.replace(/[^a-z0-9]/gi, "")}`,
              status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
            }
          : {}),
      },
    },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  const response = await fetch(`${API_ORIGIN}/api/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  });
  if (!response.ok) {
    throw new Error(
      `Signed ${type} delivery failed (${response.status}): ${await response.text()}`,
    );
  }

  return { delivered: true, type, invoiceId };
}

async function crossCutoff(subscriptionId) {
  const fixture = tracked.fixtures.get(String(subscriptionId));
  if (!fixture) throw new Error("Unknown E2E subscription fixture");
  let cutoffDaysBefore = 7;
  if (fixture.timing === "after-cutoff") {
    if (fixture.cadence === "weekly-single-day") cutoffDaysBefore = 14;
    if (fixture.cadence === "fortnightly") cutoffDaysBefore = 21;
  }
  await SubscriptionSettings.findOneAndUpdate(
    { singletonKey: "subscription-settings" },
    { cutoffDaysBefore, cutoffTime: "00:00" },
    { new: true },
  );
  return { crossed: true, cutoffDaysBefore };
}

async function autoResume(subscriptionId) {
  const resumed = await subscriptionService.AutoResumePausedSubscriptions({
    subscriptionId,
  });
  return { resumed };
}

async function finalizeCancellation(subscriptionId, referenceDate) {
  const finalized = await subscriptionService.FinalizeScheduledCancellations({
    subscriptionId,
    referenceDate: referenceDate ? new Date(referenceDate) : new Date(),
  });
  return { finalized };
}

async function approveReview(orderId) {
  const review = await Review.findOneAndUpdate(
    { orderId },
    { $set: { isVisible: true } },
    { new: true },
  ).lean();
  if (!review) throw new Error("Review fixture not found");
  return { review };
}

async function stripeState(subscription, customer) {
  let remoteSubscription = null;
  try {
    const remote = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId,
    );
    remoteSubscription = {
      id: remote.id,
      status: remote.status,
      pauseCollection: remote.pause_collection || null,
      currentPriceId: remote.items?.data?.[0]?.price?.id || null,
      interval: remote.items?.data?.[0]?.price?.recurring?.interval || null,
      intervalCount:
        remote.items?.data?.[0]?.price?.recurring?.interval_count || null,
    };
  } catch (error) {
    remoteSubscription = {
      id: subscription.stripeSubscriptionId,
      missing: true,
      errorType: error?.type || null,
    };
  }

  const intentPage = await stripe.paymentIntents.list({
    customer: customer.stripeCustomerId,
    limit: 100,
  });
  const paymentIntents = intentPage.data.map((intent) => ({
    id: intent.id,
    amount: intent.amount,
    amountReceived: intent.amount_received,
    currency: intent.currency,
    status: intent.status,
    invoice:
      typeof intent.invoice === "string" ? intent.invoice : intent.invoice?.id,
    metadata: intent.metadata || {},
  }));

  const refunds = [];
  for (const intent of intentPage.data) {
    const refundPage = await stripe.refunds.list({
      payment_intent: intent.id,
      limit: 100,
    });
    for (const refund of refundPage.data) {
      refunds.push({
        id: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
        paymentIntentId:
          typeof refund.payment_intent === "string"
            ? refund.payment_intent
            : refund.payment_intent?.id,
        metadata: refund.metadata || {},
      });
    }
  }

  return { remoteSubscription, paymentIntents, refunds };
}

async function getState(subscriptionId) {
  const subscription = await Subscription.findById(subscriptionId).lean();
  if (!subscription) throw new Error("Subscription fixture not found");
  const [customer, deliveries, orders, credits] = await Promise.all([
    Customer.findById(subscription.customer).lean(),
    SubscriptionDelivery.find({ subscription: subscription._id })
      .sort({ scheduledDate: 1 })
      .lean(),
    Order.find({ subscription: subscription._id })
      .sort({ deliveryDate: 1 })
      .lean(),
    StoreCreditTransaction.find({ subscription: subscription._id })
      .sort({ createdAt: 1 })
      .lean(),
  ]);
  const remote = await stripeState(subscription, customer);

  return JSON.parse(
    JSON.stringify({
      subscription,
      customer: {
        _id: customer._id,
        creditBalance: customer.creditBalance,
        stripeCustomerId: customer.stripeCustomerId,
      },
      deliveries,
      orders,
      credits,
      stripe: remote,
    }),
  );
}

module.exports = {
  approveReview,
  autoResume,
  createFixture,
  crossCutoff,
  deliverSignedInvoiceEvent,
  finalizeCancellation,
  getState,
  preparePaymentRetry,
  reset,
  setPaymentOutcome,
};
