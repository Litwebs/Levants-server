const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

// Keep test output clean (app.js logs env on import)
jest.spyOn(console, "log").mockImplementation(() => {});
jest.spyOn(console, "error").mockImplementation(() => {});

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
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

afterEach(() => {
  jest.clearAllMocks();
});
