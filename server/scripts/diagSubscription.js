// scripts/diagSubscription.js
// Read-only diagnostic: prints the latest subscription's DB state, its Stripe
// subscription/price, recent generated orders, and pendingChanges. No writes.
//
// Usage:
//   node scripts/diagSubscription.js
//   node scripts/diagSubscription.js --number SUB-XXXX

const env = require("../config/env");
const mongoose = require("mongoose");
const Stripe = require("stripe");

const Subscription = require("../models/subscription.model");
const Order = require("../models/order.model");

const getArg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};

const fmt = (d) => (d ? new Date(d).toISOString() : "null");

const main = async () => {
  await mongoose.connect(env.mongoUri);
  const stripe = new Stripe(env.stripe.secretKey, {
    apiVersion: env.stripe.apiVersion,
  });

  const number = getArg("--number");
  const sub = number
    ? await Subscription.findOne({ subscriptionNumber: number })
    : await Subscription.findOne().sort({ createdAt: -1 });

  if (!sub) {
    console.log("No subscription found");
    return;
  }

  console.log("\n=== DB SUBSCRIPTION ===");
  console.log("number:", sub.subscriptionNumber);
  console.log("status:", sub.status);
  console.log("frequency:", sub.frequency);
  console.log("nextDeliveryDate:", fmt(sub.nextDeliveryDate));
  console.log("pendingPriceSync:", sub.pendingPriceSync);
  console.log("stripeSubscriptionId:", sub.stripeSubscriptionId);
  console.log("stripePriceId:", sub.stripePriceId);
  console.log(
    "items:",
    sub.items.map((i) => `${i.name} x${i.quantity} @£${i.unitPrice}`),
  );
  const dbTotal = sub.items.reduce(
    (s, i) => s + Number(i.unitPrice) * Number(i.quantity),
    0,
  );
  console.log("DB recurring total: £", dbTotal);
  console.log(
    "pendingChanges:",
    sub.pendingChanges
      ? JSON.stringify(
          {
            effectiveFrom: sub.pendingChanges.effectiveFrom,
            items: (sub.pendingChanges.items || []).map(
              (i) => `${i.name} x${i.quantity} @£${i.unitPrice}`,
            ),
          },
          null,
          2,
        )
      : "null",
  );

  console.log("\n=== STRIPE SUBSCRIPTION ===");
  try {
    const ss = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId, {
      expand: ["items.data.price"],
    });
    console.log("status:", ss.status);
    for (const it of ss.items.data) {
      console.log(
        `item ${it.id}: price ${it.price.id} = £${(it.price.unit_amount || 0) / 100}/${it.price.recurring?.interval}`,
      );
    }
    console.log(
      "current_period:",
      fmt(ss.current_period_start * 1000),
      "->",
      fmt(ss.current_period_end * 1000),
    );
  } catch (e) {
    console.log("Stripe retrieve failed:", e.message);
  }

  console.log("\n=== RECENT GENERATED ORDERS ===");
  const orders = await Order.find({ subscription: sub._id })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
  for (const o of orders) {
    console.log(
      `${o.orderId} | status=${o.status} | total=£${o.total} | paid=£${o.amountPaid} | pi=${o.stripePaymentIntentId} | inv=${o.stripeInvoiceId} | deliver=${fmt(o.deliveryDate)}`,
    );
  }

  await mongoose.disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
