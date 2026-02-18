const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const { seedDefaultRoles } = require("../scripts/seedDefaultRoles"); // ✅ ADD
const { seedBusinessInfo } = require("../scripts/seedBusinessInfo"); // ✅ ADD

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_123";
process.env.FRONTEND_URL_DEV = process.env.FRONTEND_URL_DEV || "localhost:3000";
process.env.CLIENT_FRONT_URL_DEV =
  process.env.CLIENT_FRONT_URL_DEV || process.env.FRONTEND_URL_DEV;

// Keep test output clean (opt-out by setting JEST_SHOW_CONSOLE=1)
const showConsole = process.env.JEST_SHOW_CONSOLE === "1";

jest.mock("stripe", () => {
  return jest.fn(() => ({
    webhooks: {
      constructEvent: jest.fn((payload) => {
        // Payload can be Buffer (raw-body) or already-parsed object
        if (Buffer.isBuffer(payload)) {
          return JSON.parse(payload.toString("utf8"));
        }
        if (typeof payload === "string") {
          return JSON.parse(payload);
        }
        return payload;
      }),
    },
    products: {
      create: jest.fn(async () => ({ id: "prod_test" })),
      update: jest.fn(async () => ({})),
    },
    prices: {
      create: jest.fn(async () => ({ id: "price_test" })),
    },
    checkout: {
      sessions: {
        create: jest.fn(async () => ({
          id: "cs_test_123",
          url: "https://checkout.stripe.com/test-session",
        })),
        retrieve: jest.fn(async () => ({
          id: "cs_test_123",
          payment_intent: "pi_test_456",
        })),
      },
    },
    refunds: {
      create: jest.fn(async () => ({ id: "re_test_789", status: "succeeded" })),
    },

    coupons: {
      create: jest.fn(async () => ({ id: "coupon_test_123" })),
    },

    promotionCodes: {
      create: jest.fn(async () => ({ id: "promo_test_123" })),
      update: jest.fn(async () => ({})),
    },
  }));
});

jest.mock("../Integration/google.geocode", () => ({
  geocodeAddress: jest.fn(async () => ({ lat: 52.2053, lng: 0.1218 })),
}));

let mongo;

async function clearDatabase() {
  if (!mongoose.connection?.db) return;
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });
  const uri = mongo.getUri();
  await mongoose.connect(uri);

  // Pre-initialize model indexes/collections once.
  // This reduces flaky transaction errors in mongodb-memory-server
  // (e.g., "catalog changes" / lock timeouts during the first transactional write).
  await Promise.all([
    require("../models/file.model").init(),
    require("../models/businessInfo.model").init(),
    require("../models/role.model").init(),
    require("../models/user.model").init(),
    require("../models/session.model").init(),
    require("../models/passwordResetToken.model").init(),
    require("../models/customer.model").init(),
    require("../models/product.model").init(),
    require("../models/variant.model").init(),
    require("../models/discount.model").init(),
    require("../models/discountRedemption.model").init(),
    require("../models/order.model").init(),
  ]);
});

beforeEach(async () => {
  if (!showConsole) {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  }
  await clearDatabase();
  await seedDefaultRoles(); // ✅ THIS IS THE FIX
  await seedBusinessInfo(); // ✅ Seed business info for tests
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

afterEach(() => {
  // Restore any jest.spyOn() mocks (important for suites that mock mongoose, models, etc.)
  jest.restoreAllMocks();
  jest.clearAllMocks();
});
