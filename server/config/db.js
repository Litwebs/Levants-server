const mongoose = require("mongoose");
const { mongoUri, env } = require("./env");
const logger = require("../utils/logger.util");

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
};
