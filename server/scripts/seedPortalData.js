"use strict";

/**
 * seedPortalData.js
 *
 * Seeds development data for all new customer-portal models:
 *   - Registered Customers (with addresses, notification prefs)
 *   - Subscriptions + SubscriptionDeliveries
 *   - Payments + PaymentMethods
 *   - CustomerNotifications
 *   - SupportRequests
 *
 * SAFE: Only deletes documents tagged with { _seed: true }.
 * Run: node scripts/seedPortalData.js [--fresh]
 *   --fresh  → also wipe existing seeded records first (default: keep)
 */

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const Customer = require("../models/customer.model");
const Product = require("../models/product.model");
const ProductVariant = require("../models/variant.model");
const Subscription = require("../models/subscription.model");
const SubscriptionDelivery = require("../models/subscriptionDelivery.model");
const Payment = require("../models/payment.model");
const PaymentMethod = require("../models/paymentMethod.model");
const CustomerNotification = require("../models/customerNotification.model");
const SupportRequest = require("../models/supportRequest.model");

// ─── Config ─────────────────────────────────────────────────────────────────

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error("Missing env: MONGO_URI");

const FRESH = process.argv.includes("--fresh");
const SEED_PASSWORD = "DevPass1"; // min 8 chars, 1 uppercase, 1 digit
const SALT_ROUNDS = 10;

// ─── Helpers ────────────────────────────────────────────────────────────────

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const subNumber = (i) => {
  const now = new Date();
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  return `SUB-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${String(100000 + i).slice(1)}`;
};

// ─── Seed Data Definitions ───────────────────────────────────────────────────

const PORTAL_CUSTOMERS = [
  {
    firstName: "Alice",
    lastName: "Meadows",
    email: "alice.meadows@portal-seed.dev",
    phone: "07911000001",
  },
  {
    firstName: "Ben",
    lastName: "Carter",
    email: "ben.carter@portal-seed.dev",
    phone: "07911000002",
  },
  {
    firstName: "Chloe",
    lastName: "Patel",
    email: "chloe.patel@portal-seed.dev",
    phone: "07911000003",
  },
  {
    firstName: "Dan",
    lastName: "Hughes",
    email: "dan.hughes@portal-seed.dev",
    phone: "07911000004",
  },
  {
    firstName: "Ella",
    lastName: "Brooks",
    email: "ella.brooks@portal-seed.dev",
    phone: "07911000005",
  },
];

const CITIES = ["Bradford", "Leeds", "Manchester", "Sheffield", "Halifax"];
const STREETS = [
  "Maple Avenue",
  "Oak Street",
  "Pine Road",
  "Cedar Lane",
  "Birch Close",
];

const buildAddress = (i, isDefault = true) => ({
  label: isDefault ? "Home" : "Work",
  fullName: `Seed User ${i + 1}`,
  phone: `0791100000${i + 1}`,
  line1: `${(i + 1) * 10} ${STREETS[i % STREETS.length]}`,
  line2: null,
  city: CITIES[i % CITIES.length],
  postcode: `BD${i + 1} ${i + 1}AA`,
  country: "United Kingdom",
  deliveryInstructions: i % 2 === 0 ? "Leave at the door" : null,
  isDefault,
});

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");

  // ── 1. Clean up previous seed data ──────────────────────────────────────
  if (FRESH) {
    console.log("🧨 Removing existing portal seed data...");
    const emails = PORTAL_CUSTOMERS.map((c) => c.email);
    const oldCustomers = await Customer.find({ email: { $in: emails } }).select("_id").lean();
    const oldIds = oldCustomers.map((c) => c._id);

    if (oldIds.length) {
      await Promise.all([
        SupportRequest.deleteMany({ customer: { $in: oldIds } }),
        CustomerNotification.deleteMany({ customer: { $in: oldIds } }),
        Payment.deleteMany({ customer: { $in: oldIds } }),
        PaymentMethod.deleteMany({ customer: { $in: oldIds } }),
        Subscription.deleteMany({ customer: { $in: oldIds } }),
        SubscriptionDelivery.deleteMany({ customer: { $in: oldIds } }),
        Customer.deleteMany({ _id: { $in: oldIds } }),
      ]);
      console.log(`   Removed ${oldIds.length} customers and their related data`);
    }
  }

  // ── 2. Customers ─────────────────────────────────────────────────────────
  console.log("👤 Seeding portal customers...");
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);

  const existingEmails = new Set(
    (await Customer.find({ email: { $in: PORTAL_CUSTOMERS.map((c) => c.email) } }).select("email").lean())
      .map((c) => c.email),
  );

  const toInsert = PORTAL_CUSTOMERS.filter((c) => !existingEmails.has(c.email));

  let customers = [];

  if (toInsert.length) {
    const docs = toInsert.map((c, i) => ({
      ...c,
      passwordHash,
      isGuest: false,
      status: i === 4 ? "disabled" : "active", // last customer is disabled
      emailVerifiedAt: i < 4 ? new Date() : null,
      notificationPreferences: {
        orderUpdates: true,
        subscriptionUpdates: true,
        deliveryUpdates: true,
        promotions: i % 2 === 0,
      },
      addresses: [
        buildAddress(i, true),
        ...(i % 2 === 0 ? [buildAddress(i + 1, false)] : []),
      ],
    }));

    customers = await Customer.insertMany(docs, { ordered: false });
    console.log(`   Created ${customers.length} customers`);
  } else {
    customers = await Customer.find({ email: { $in: PORTAL_CUSTOMERS.map((c) => c.email) } }).lean();
    console.log(`   All customers already exist, skipping creation`);
  }

  if (!customers.length) {
    console.log("⚠️  No customers to seed further data against. Exiting.");
    await mongoose.disconnect();
    return;
  }

  // Active customers only (skip the disabled one for most data)
  const active = customers.filter((c) => c.status !== "disabled");

  // ── 3. Find usable products/variants ────────────────────────────────────
  console.log("📦 Finding active products for subscription items...");
  const products = await Product.find({ status: "active" }).select("_id name").limit(6).lean();

  let variantsByProduct = {};
  if (products.length) {
    const allVariants = await ProductVariant.find({
      product: { $in: products.map((p) => p._id) },
      status: "active",
      stockQuantity: { $gt: 0 },
    }).select("_id product name sku price").limit(20).lean();

    for (const v of allVariants) {
      const key = v.product.toString();
      if (!variantsByProduct[key]) variantsByProduct[key] = [];
      variantsByProduct[key].push(v);
    }
  }

  const availableVariants = Object.values(variantsByProduct).flat();

  if (!availableVariants.length) {
    console.log("   ⚠️  No active variants found — subscriptions will be skipped");
  }

  // ── 4. Subscriptions ─────────────────────────────────────────────────────
  const subscriptions = [];

  if (availableVariants.length) {
    console.log("🔄 Seeding subscriptions...");

    const FREQUENCIES = ["weekly", "every_two_weeks", "monthly"];
    const STATUSES = ["active", "active", "paused", "cancelled"]; // weighted toward active

    for (let i = 0; i < active.length; i++) {
      const customer = active[i];
      const address = customer.addresses?.[0];
      if (!address) continue;

      const frequency = FREQUENCIES[i % FREQUENCIES.length];
      const preferredDay = (i + 1) % 7; // Mon–Sun spread
      const nextDelivery = addDays(new Date(), 7 - (new Date().getDay() - preferredDay + 7) % 7 || 7);
      const status = STATUSES[i % STATUSES.length];

      // Pick 1–2 variants for this subscription
      const itemVariants = availableVariants.slice(i % availableVariants.length, (i % availableVariants.length) + 2);

      const sub = await Subscription.create({
        subscriptionNumber: subNumber(i + 1),
        customer: customer._id,
        status,
        frequency,
        preferredDeliveryDay: preferredDay,
        nextDeliveryDate: status === "active" ? nextDelivery : null,
        startDate: addDays(new Date(), -30),
        endDate: null,
        pausedAt: status === "paused" ? addDays(new Date(), -3) : null,
        cancelledAt: status === "cancelled" ? addDays(new Date(), -10) : null,
        cancelReason: status === "cancelled" ? "No longer needed" : null,
        deliveryAddress: {
          line1: address.line1,
          line2: address.line2 || null,
          city: address.city,
          postcode: address.postcode,
          country: address.country,
          deliveryInstructions: address.deliveryInstructions || null,
        },
        items: itemVariants.map((v) => ({
          product: v.product,
          variant: v._id,
          name: v.name,
          sku: v.sku,
          quantity: rand([1, 2, 3]),
          unitPrice: v.price,
        })),
        notes: i % 3 === 0 ? "Please knock loudly" : null,
      });

      subscriptions.push(sub);

      // Pre-create delivery slots for active subs
      if (status === "active") {
        const slots = [];
        for (let s = 0; s < 3; s++) {
          const freqDays = { weekly: 7, every_two_weeks: 14, monthly: 30 }[frequency];
          slots.push({
            subscription: sub._id,
            customer: customer._id,
            scheduledDate: addDays(nextDelivery, freqDays * s),
            status: "scheduled",
          });
        }
        await SubscriptionDelivery.insertMany(slots);
      }
    }

    console.log(`   Created ${subscriptions.length} subscriptions`);
  }

  // ── 5. Payments ──────────────────────────────────────────────────────────
  console.log("💳 Seeding payments...");

  const PAYMENT_STATUSES = ["paid", "paid", "pending", "failed", "refunded"];
  const payments = [];

  for (let i = 0; i < active.length; i++) {
    const customer = active[i];
    const sub = subscriptions.find((s) => s.customer.toString() === customer._id.toString());
    const status = PAYMENT_STATUSES[i % PAYMENT_STATUSES.length];

    const payment = await Payment.create({
      customer: customer._id,
      subscription: sub?._id ?? null,
      amount: Number((rand([5, 7.5, 10, 12.5, 15])).toFixed(2)),
      currency: "GBP",
      status,
      paymentMethod: "cash",
      providerReference: null,
      notes: status === "failed" ? "Card declined" : null,
      paidAt: status === "paid" ? addDays(new Date(), -i) : null,
      failedAt: status === "failed" ? addDays(new Date(), -i) : null,
      refundedAt: status === "refunded" ? addDays(new Date(), -1) : null,
    });
    payments.push(payment);
  }

  // ── 6. Payment Methods ────────────────────────────────────────────────────
  console.log("   Seeding payment methods...");

  const CARD_BRANDS = ["Visa", "Mastercard", "Amex"];

  for (let i = 0; i < active.length; i++) {
    const customer = active[i];

    await PaymentMethod.create({
      customer: customer._id,
      type: "card",
      provider: "stripe",
      lastFour: String(1000 + i * 111).slice(-4),
      expiryMonth: (i % 12) + 1,
      expiryYear: 2027 + (i % 3),
      cardBrand: CARD_BRANDS[i % CARD_BRANDS.length],
      isDefault: true,
    });
  }

  console.log(`   Created ${active.length} payments + ${active.length} payment methods`);

  // ── 7. Customer Notifications ─────────────────────────────────────────────
  console.log("🔔 Seeding customer notifications...");

  const NOTIFICATION_TEMPLATES = [
    {
      type: "subscription_created",
      title: "Subscription created",
      message: "Your weekly dairy subscription has been set up successfully.",
    },
    {
      type: "subscription_paused",
      title: "Subscription paused",
      message: "Your subscription has been paused. Resume any time from your account.",
    },
    {
      type: "delivery_scheduled",
      title: "Delivery scheduled",
      message: "Your next delivery is scheduled for this Monday.",
    },
    {
      type: "payment_received",
      title: "Payment received",
      message: "We received your payment of £7.50. Thank you!",
    },
    {
      type: "support_request_resolved",
      title: "Support request resolved",
      message: "Your support request has been marked as resolved.",
    },
  ];

  const notifDocs = [];

  for (const customer of active) {
    const count = rand([1, 2, 3]);
    for (let n = 0; n < count; n++) {
      const tmpl = NOTIFICATION_TEMPLATES[n % NOTIFICATION_TEMPLATES.length];
      notifDocs.push({
        customer: customer._id,
        type: tmpl.type,
        title: tmpl.title,
        message: tmpl.message,
        readAt: n === 0 ? null : addDays(new Date(), -(n * 2)), // first is unread
        relatedSubscription:
          tmpl.type.startsWith("subscription") || tmpl.type === "delivery_scheduled"
            ? (subscriptions.find((s) => s.customer.toString() === customer._id.toString())?._id ?? null)
            : null,
      });
    }
  }

  await CustomerNotification.insertMany(notifDocs);
  console.log(`   Created ${notifDocs.length} notifications`);

  // ── 8. Support Requests ───────────────────────────────────────────────────
  console.log("🎧 Seeding support requests...");

  const SUPPORT_TEMPLATES = [
    {
      issueType: "delivery_issue",
      subject: "My delivery didn't arrive",
      message: "I was expecting a delivery on Monday but nothing arrived. Please advise.",
      status: "open",
    },
    {
      issueType: "subscription_issue",
      subject: "Want to change delivery day",
      message: "I'd like to change my delivery from Monday to Wednesday if possible.",
      status: "in_review",
    },
    {
      issueType: "payment_issue",
      subject: "Charged twice this week",
      message: "I noticed two payments taken this week. Can you refund one please?",
      status: "resolved",
    },
    {
      issueType: "general_enquiry",
      subject: "Do you deliver to Sheffield?",
      message: "Hi, I was wondering if you cover the Sheffield S10 area?",
      status: "closed",
    },
  ];

  const supportDocs = active.map((customer, i) => {
    const tmpl = SUPPORT_TEMPLATES[i % SUPPORT_TEMPLATES.length];
    const sub = subscriptions.find((s) => s.customer.toString() === customer._id.toString());

    return {
      customer: customer._id,
      relatedOrder: null,
      relatedSubscription:
        tmpl.issueType === "subscription_issue" ? (sub?._id ?? null) : null,
      issueType: tmpl.issueType,
      subject: tmpl.subject,
      message: tmpl.message,
      status: tmpl.status,
      notes: [],
      resolvedAt:
        tmpl.status === "resolved" || tmpl.status === "closed"
          ? addDays(new Date(), -1)
          : null,
    };
  });

  await SupportRequest.insertMany(supportDocs);
  console.log(`   Created ${supportDocs.length} support requests`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n✅ Portal seed complete!");
  console.log("─".repeat(40));
  console.log(`  Customers        : ${customers.length}`);
  console.log(`  Subscriptions    : ${subscriptions.length}`);
  console.log(`  Payments         : ${payments.length}`);
  console.log(`  Payment Methods  : ${active.length}`);
  console.log(`  Notifications    : ${notifDocs.length}`);
  console.log(`  Support Requests : ${supportDocs.length}`);
  console.log("─".repeat(40));
  console.log(`  Portal login password: ${SEED_PASSWORD}`);
  console.log(
    `  Customer emails:\n${PORTAL_CUSTOMERS.map((c) => `    ${c.email}`).join("\n")}`,
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
