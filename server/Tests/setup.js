const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { seedDefaultRoles } = require("../scripts/seedDefaultRoles"); // ✅ ADD
const { seedBusinessInfo } = require("../scripts/seedBusinessInfo"); // ✅ ADD

// Keep test output clean
jest.spyOn(console, "log").mockImplementation(() => {});
jest.spyOn(console, "error").mockImplementation(() => {});

jest.mock("stripe", () => {
  return jest.fn(() => ({
    products: {
      create: jest.fn(async () => ({ id: "prod_test" })),
      update: jest.fn(async () => ({})),
    },
    prices: {
      create: jest.fn(async () => ({ id: "price_test" })),
    },
  }));
});

let mongo;

async function clearDatabase() {
  if (!mongoose.connection?.db) return;
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  await mongoose.connect(uri);
});

beforeEach(async () => {
  await clearDatabase();
  await seedDefaultRoles(); // ✅ THIS IS THE FIX
  await seedBusinessInfo(); // ✅ Seed business info for tests
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

afterEach(() => {
  jest.clearAllMocks();
});
