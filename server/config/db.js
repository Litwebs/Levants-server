const mongoose = require("mongoose");
const { mongoUri, env } = require("./env");
const logger = require("../utils/logger.util");


const ANALYTICS_ORDER_INDEXES = [
  {
    key: { status: 1, paidAt: 1 },
    name: "analytics_status_paidAt",
  },
  {
    key: { status: 1, createdAt: 1 },
    name: "analytics_status_createdAt",
  },
  {
    key: { orderType: 1, status: 1, paidAt: 1 },
    name: "analytics_orderType_status_paidAt",
  },
  {
    key: { "metadata.manualImport": 1, status: 1, paidAt: 1 },
    name: "analytics_import_status_paidAt",
  },
  {
    key: { subscription: 1, status: 1, paidAt: 1 },
    name: "analytics_subscription_status_paidAt",
  },
  {
    key: { "refunds.status": 1, "refunds.refundedAt": 1 },
    name: "analytics_refund_status_refundedAt",
  },
  {
    key: { "items.product": 1, status: 1, paidAt: 1 },
    name: "analytics_product_status_paidAt",
  },
  {
    key: { "items.variant": 1, status: 1, paidAt: 1 },
    name: "analytics_variant_status_paidAt",
  },
];

const ANALYTICS_SUBSCRIPTION_INDEXES = [
  {
    key: { status: 1, isCancellationScheduled: 1 },
    name: "analytics_subscription_status_scheduledCancellation",
  },
  {
    key: { createdAt: 1 },
    name: "analytics_subscription_createdAt",
  },
];

const indexKeysEqual = (actual, expected) => {
  const actualEntries = Object.entries(actual || {});
  const expectedEntries = Object.entries(expected || {});

  return (
    actualEntries.length === expectedEntries.length &&
    expectedEntries.every(
      ([field, direction], index) =>
        actualEntries[index]?.[0] === field &&
        actualEntries[index]?.[1] === direction,
    )
  );
};

async function ensureIndexesByKey(collection, specs) {
  if (!collection) return;

  const indexes = await collection.indexes();

  for (const spec of specs) {
    const exists = indexes.some((index) => indexKeysEqual(index?.key, spec.key));
    if (exists) continue;

    await collection.createIndex(spec.key, { name: spec.name });
  }
}

async function ensureAnalyticsOrderIndexes() {
  const collection = mongoose.connection?.db?.collection("orders");
  if (!collection) return;
  await ensureIndexesByKey(collection, ANALYTICS_ORDER_INDEXES);
}

async function ensureAnalyticsSubscriptionIndexes() {
  const collection = mongoose.connection?.db?.collection("subscriptions");
  if (!collection) return;
  await ensureIndexesByKey(collection, ANALYTICS_SUBSCRIPTION_INDEXES);
}

async function ensureDiscountCodeIndex() {
  const collection = mongoose.connection?.db?.collection("discounts");
  if (!collection) return;

  const indexes = await collection.indexes();
  const codeIndex = indexes.find((index) => index?.key && index.key.code === 1);

  if (codeIndex?.unique) {
    await collection.dropIndex(codeIndex.name);
  }

  if (!codeIndex || codeIndex.unique) {
    await collection.createIndex({ code: 1 }, { name: "code_1" });
  }
}

async function ensureSubscriptionDeliveryUniqueIndex() {
  const collection =
    mongoose.connection?.db?.collection("subscriptiondeliveries");
  if (!collection) return;

  const duplicate = await collection
    .aggregate([
      {
        $group: {
          _id: { subscription: "$subscription", scheduledDate: "$scheduledDate" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ])
    .next();
  if (duplicate) {
    throw new Error(
      "Cannot enforce subscription delivery uniqueness: duplicate subscription/date slots exist",
    );
  }

  const indexes = await collection.indexes();
  const matching = indexes.find(
    (index) =>
      index?.key?.subscription === 1 && index?.key?.scheduledDate === 1,
  );
  if (matching?.unique) return;
  if (matching) await collection.dropIndex(matching.name);
  await collection.createIndex(
    { subscription: 1, scheduledDate: 1 },
    { unique: true, name: "subscription_1_scheduledDate_1" },
  );
}

async function ensureSubscriptionOrderInvoiceUniqueIndex() {
  const collection = mongoose.connection?.db?.collection("orders");
  if (!collection) return;

  const duplicate = await collection
    .aggregate([
      { $match: { stripeInvoiceId: { $type: "string" } } },
      {
        $group: {
          _id: {
            stripeInvoiceId: "$stripeInvoiceId",
            subscription: "$subscription",
            deliveryDate: "$deliveryDate",
          },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ])
    .next();
  if (duplicate) {
    throw new Error(
      "Cannot enforce subscription order idempotency: duplicate invoice/delivery orders exist",
    );
  }

  const indexes = await collection.indexes();
  const matching = indexes.find(
    (index) =>
      index?.key?.stripeInvoiceId === 1 &&
      index?.key?.subscription === 1 &&
      index?.key?.deliveryDate === 1,
  );
  if (matching?.unique) return;
  if (matching) await collection.dropIndex(matching.name);
  await collection.createIndex(
    { stripeInvoiceId: 1, subscription: 1, deliveryDate: 1 },
    {
      unique: true,
      name: "stripeInvoiceId_1_subscription_1_deliveryDate_1",
      partialFilterExpression: { stripeInvoiceId: { $type: "string" } },
    },
  );
}

mongoose.set("strictQuery", true);

const connectDb = async () => {
  if (!mongoUri) {
    throw new Error("Mongo connection string missing (MONGODB_URI)");
  }

  try {
    await mongoose.connect(mongoUri, {
      // options for newer mongoose are mostly auto-handled
      autoIndex: env !== "production",
    });

    await ensureDiscountCodeIndex();
    await ensureSubscriptionDeliveryUniqueIndex();
    await ensureSubscriptionOrderInvoiceUniqueIndex();
    await ensureAnalyticsOrderIndexes();
    await ensureAnalyticsSubscriptionIndexes();

    if (env !== "test") {
      logger.db("MongoDB connected");
    }
  } catch (err) {
    logger.error("MongoDB connection error", err);
    process.exit(1);
  }
};

module.exports = {
  connectDb,
  ANALYTICS_ORDER_INDEXES,
  ANALYTICS_SUBSCRIPTION_INDEXES,
  indexKeysEqual,
  ensureIndexesByKey,
  ensureAnalyticsOrderIndexes,
  ensureAnalyticsSubscriptionIndexes,
};
