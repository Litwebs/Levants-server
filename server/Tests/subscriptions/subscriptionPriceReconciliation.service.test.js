"use strict";

jest.mock("../../utils/stripe.util", () => ({
  subscriptions: {
    retrieve: jest.fn(),
    update: jest.fn(),
  },
  prices: {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock("../../utils/logger.util", () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

const mongoose = require("mongoose");
const Subscription = require("../../models/subscription.model");
const stripe = require("../../utils/stripe.util");
const {
  reconcileSubscriptionPrice,
  reconcileSubscriptionPrices,
  resolveExpectedStripePrice,
} = require("../../services/subscriptions/subscriptionPriceReconciliation.service");

function makeSubscription(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439011",
    subscriptionNumber: "SUB-TEST-PRICE-SYNC",
    status: "active",
    isCancellationScheduled: false,
    frequency: "weekly",
    preferredDeliveryDay: 3,
    preferredDeliveryDays: [3],
    items: [
      {
        variant: "507f1f77bcf86cd799439021",
        unitPrice: 2.5,
        quantity: 2,
      },
    ],
    pendingChanges: null,
    pendingPriceSync: false,
    stripePriceSyncPending: false,
    stripeSubscriptionId: "sub_test",
    stripeProductId: "prod_test",
    stripePriceId: "price_old",
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function remoteSubscription(price) {
  return {
    id: "sub_test",
    items: {
      data: [
        {
          id: "si_test",
          price,
        },
      ],
    },
  };
}

function remotePrice({
  id = "price_old",
  amount = 600,
  interval = "week",
  intervalCount = 1,
  product = "prod_test",
} = {}) {
  return {
    id,
    product,
    currency: "gbp",
    unit_amount: amount,
    recurring: {
      interval,
      interval_count: intervalCount,
    },
  };
}

describe("subscription recurring price reconciliation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test("expected price uses pending post-cutoff items and multi-day delivery fees", () => {
    const subscription = makeSubscription({
      preferredDeliveryDays: [0, 3],
      pendingChanges: {
        items: [
          { unitPrice: 3, quantity: 2 },
          { unitPrice: 1.5, quantity: 1 },
        ],
      },
    });

    const expected = resolveExpectedStripePrice(subscription);

    // £7.50 of pending items + two £1 delivery fees.
    expect(expected.amountMinor).toBe(950);
    expect(expected.deliveryDays).toEqual([0, 3]);
    expect(expected.interval).toBe("week");
    expect(expected.intervalCount).toBe(1);
  });

  test("pending cadence metadata does not override the live cadence used by the existing Stripe sync", () => {
    const subscription = makeSubscription({
      frequency: "weekly",
      preferredDeliveryDay: 3,
      preferredDeliveryDays: [3],
      pendingChanges: {
        items: [{ unitPrice: 2.5, quantity: 2 }],
        frequency: "monthly",
        preferredDeliveryDay: 5,
        preferredDeliveryDays: [5],
      },
    });

    const expected = resolveExpectedStripePrice(subscription);

    expect(expected.frequency).toBe("weekly");
    expect(expected.interval).toBe("week");
    expect(expected.intervalCount).toBe(1);
    expect(expected.deliveryDays).toEqual([3]);
    expect(expected.amountMinor).toBe(600);
  });

  test("Mongo ObjectId input is treated as an id and loads the subscription record", async () => {
    const objectId = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");
    const subscription = makeSubscription();
    const findById = jest
      .spyOn(Subscription, "findById")
      .mockResolvedValue(subscription);
    stripe.subscriptions.retrieve.mockResolvedValue(
      remoteSubscription(remotePrice({ id: "price_old", amount: 600 })),
    );

    const result = await reconcileSubscriptionPrice(objectId);

    expect(findById).toHaveBeenCalledWith(objectId);
    expect(result).toMatchObject({
      ok: true,
      action: "synced",
      priceId: "price_old",
    });
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_test");
  });

  test("matching remote price clears only the reliability retry marker and preserves deferred sync state", async () => {
    const subscription = makeSubscription({
      pendingPriceSync: true,
      stripePriceSyncPending: true,
      stripePriceId: "price_stale_local_id",
    });
    stripe.subscriptions.retrieve.mockResolvedValue(
      remoteSubscription(remotePrice({ id: "price_remote", amount: 600 })),
    );

    const result = await reconcileSubscriptionPrice(subscription);

    expect(result).toMatchObject({
      ok: true,
      action: "synced",
      priceId: "price_remote",
    });
    expect(subscription.stripePriceSyncPending).toBe(false);
    expect(subscription.pendingPriceSync).toBe(true);
    expect(subscription.stripePriceId).toBe("price_remote");
    expect(subscription.save).toHaveBeenCalledTimes(1);
    expect(stripe.prices.create).not.toHaveBeenCalled();
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  test("failed repair is persisted on the reliability marker and a later retry repairs the same subscription", async () => {
    const subscription = makeSubscription();
    stripe.subscriptions.retrieve.mockResolvedValue(
      remoteSubscription(remotePrice({ amount: 500 })),
    );
    stripe.prices.create
      .mockRejectedValueOnce(new Error("temporary Stripe outage"))
      .mockResolvedValueOnce({ id: "price_repaired" });
    stripe.subscriptions.update.mockResolvedValue({ id: "sub_test" });
    stripe.prices.update.mockResolvedValue({ id: "price_old", active: false });

    const failed = await reconcileSubscriptionPrice(subscription);

    expect(failed).toMatchObject({
      ok: false,
      action: "pending",
      pending: true,
    });
    expect(subscription.stripePriceSyncPending).toBe(true);
    expect(subscription.pendingPriceSync).toBe(false);
    expect(subscription.stripePriceId).toBe("price_old");

    const repaired = await reconcileSubscriptionPrice(subscription);

    expect(repaired).toMatchObject({
      ok: true,
      action: "repaired",
      priceId: "price_repaired",
    });
    expect(subscription.stripePriceSyncPending).toBe(false);
    expect(subscription.pendingPriceSync).toBe(false);
    expect(subscription.stripePriceId).toBe("price_repaired");
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      "sub_test",
      {
        items: [{ id: "si_test", price: "price_repaired" }],
        proration_behavior: "none",
      },
      expect.objectContaining({
        idempotencyKey: expect.stringContaining(
          "subscription-price-reconcile:507f1f77bcf86cd799439011:price_old:600:weekly:3:attach",
        ),
      }),
    );
    expect(stripe.prices.update).toHaveBeenCalledWith("price_old", {
      active: false,
    });
  });

  test("repeated repair after success does not create another Stripe price", async () => {
    const subscription = makeSubscription();
    const oldRemote = remoteSubscription(remotePrice({ amount: 500 }));
    const repairedRemote = remoteSubscription(
      remotePrice({ id: "price_repaired", amount: 600 }),
    );
    stripe.subscriptions.retrieve
      .mockResolvedValueOnce(oldRemote)
      .mockResolvedValueOnce(repairedRemote);
    stripe.prices.create.mockResolvedValue({ id: "price_repaired" });
    stripe.subscriptions.update.mockResolvedValue({ id: "sub_test" });
    stripe.prices.update.mockResolvedValue({ id: "price_old", active: false });

    const first = await reconcileSubscriptionPrice(subscription);
    const second = await reconcileSubscriptionPrice(subscription);

    expect(first.action).toBe("repaired");
    expect(second.action).toBe("synced");
    expect(stripe.prices.create).toHaveBeenCalledTimes(1);
    expect(stripe.subscriptions.update).toHaveBeenCalledTimes(1);
  });
  test("cursor pagination reconciles more than 500 subscriptions without starvation", async () => {
    const subscriptions = Array.from({ length: 501 }, (_, index) =>
      makeSubscription({
        _id: new mongoose.Types.ObjectId(
          String(index + 1).padStart(24, "0"),
        ),
        subscriptionNumber: `SUB-PAGE-${index + 1}`,
        stripeSubscriptionId: `sub_page_${index + 1}`,
      }),
    );

    jest.spyOn(Subscription, "find").mockImplementation((filter) => {
      let startIndex = 0;
      if (filter?._id?.$gt) {
        const cursor = String(filter._id.$gt);
        const found = subscriptions.findIndex(
          (subscription) => String(subscription._id) === cursor,
        );
        startIndex = found + 1;
      }

      const query = {
        _limit: 100,
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn(function setLimit(value) {
          this._limit = value;
          return this;
        }),
        exec: jest.fn(async function execute() {
          return subscriptions.slice(startIndex, startIndex + this._limit);
        }),
      };
      return query;
    });

    stripe.subscriptions.retrieve.mockImplementation(async (subscriptionId) =>
      remoteSubscription(
        remotePrice({
          id: `price_${subscriptionId}`,
          amount: 600,
        }),
      ),
    );

    const summary = await reconcileSubscriptionPrices({
      onlyPending: false,
      batchSize: 200,
    });

    expect(summary.checked).toBe(501);
    expect(summary.batches).toBe(3);
    expect(summary.pending).toBe(0);
    expect(summary.synced).toBe(501);
    expect(Subscription.find).toHaveBeenCalledTimes(3);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledTimes(501);
  });

});
