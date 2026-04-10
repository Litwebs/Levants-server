const mongoose = require("mongoose");
const { mongoUri, env } = require("./env");

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

    if (env !== "test") {
      // eslint-disable-next-line no-console
      console.log(`MongoDB connected`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("MongoDB connection error", err);
    process.exit(1);
  }
};

module.exports = {
  connectDb,
};
