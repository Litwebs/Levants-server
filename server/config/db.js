const mongoose = require("mongoose");
const { mongoUri, env } = require("./env");

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
