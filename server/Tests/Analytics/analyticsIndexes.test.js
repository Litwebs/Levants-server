const Order = require("../../models/order.model");
const Subscription = require("../../models/subscription.model");
const {
  ANALYTICS_ORDER_INDEXES,
  ANALYTICS_SUBSCRIPTION_INDEXES,
  indexKeysEqual,
  ensureIndexesByKey,
} = require("../../config/db");

describe("analytics production indexes", () => {
  test("order schema declares every analytics read-path index", () => {
    const schemaIndexes = Order.schema.indexes();

    for (const expected of ANALYTICS_ORDER_INDEXES) {
      expect(
        schemaIndexes.some(
          ([key, options]) =>
            indexKeysEqual(key, expected.key) && options?.name === expected.name,
        ),
      ).toBe(true);
    }
  });

  test("subscription schema declares every analytics read-path index", () => {
    const schemaIndexes = Subscription.schema.indexes();

    for (const expected of ANALYTICS_SUBSCRIPTION_INDEXES) {
      expect(
        schemaIndexes.some(
          ([key, options]) =>
            indexKeysEqual(key, expected.key) && options?.name === expected.name,
        ),
      ).toBe(true);
    }
  });

  test("index key comparison preserves compound field order", () => {
    expect(indexKeysEqual({ status: 1, paidAt: 1 }, { status: 1, paidAt: 1 })).toBe(
      true,
    );
    expect(indexKeysEqual({ paidAt: 1, status: 1 }, { status: 1, paidAt: 1 })).toBe(
      false,
    );
  });

  test("production index ensure is idempotent and creates only missing keys", async () => {
    const collection = {
      indexes: jest.fn().mockResolvedValue([
        {
          name: "existing_other_name",
          key: { status: 1, paidAt: 1 },
        },
      ]),
      createIndex: jest.fn().mockResolvedValue("created"),
    };

    await ensureIndexesByKey(collection, [
      {
        key: { status: 1, paidAt: 1 },
        name: "analytics_status_paidAt",
      },
      {
        key: { status: 1, createdAt: 1 },
        name: "analytics_status_createdAt",
      },
    ]);

    expect(collection.indexes).toHaveBeenCalledTimes(1);
    expect(collection.createIndex).toHaveBeenCalledTimes(1);
    expect(collection.createIndex).toHaveBeenCalledWith(
      { status: 1, createdAt: 1 },
      { name: "analytics_status_createdAt" },
    );
  });
});
