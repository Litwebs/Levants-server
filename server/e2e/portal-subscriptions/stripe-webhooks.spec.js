"use strict";

const { test, expect } = require("@playwright/test");
const {
  API_ORIGIN,
  createFixture,
  deliverSignedInvoiceEvent,
  getState,
  login,
  portalHeaders,
  preparePaymentRetry,
  reset,
} = require("../support/e2e-client");

const STABLE_EXACT_STATE_MS = 3_000;

function id(value) {
  if (value && typeof value === "object") {
    return String(value._id || value.id || value);
  }
  return String(value || "");
}

function localWeekday(value) {
  const name = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
  }).format(new Date(value));
  return {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }[name];
}

function orderItems(items) {
  return (items || [])
    .map((item) => ({
      variantId: id(item.variant),
      quantity: Number(item.quantity),
      unitPrice: Number(item.price),
    }))
    .sort((left, right) => left.variantId.localeCompare(right.variantId));
}

function expectedItems(items, fixture) {
  return items
    .map((item) => {
      const variant = Object.values(fixture.variants).find(
        (candidate) => candidate.id === item.variantId,
      );
      if (!variant) {
        throw new Error(`Unknown E2E variant ${item.variantId}`);
      }
      return {
        variantId: item.variantId,
        quantity: Number(item.quantity),
        unitPrice: Number(variant.price),
      };
    })
    .sort((left, right) => left.variantId.localeCompare(right.variantId));
}

function generatedDeliveries(state) {
  return state.deliveries.filter((delivery) => delivery.status === "generated");
}

function paidOrders(state) {
  return state.orders.filter((order) => order.status === "paid");
}

function realInvoiceIds(orders) {
  return new Set(
    orders
      .map((order) => order.stripeInvoiceId)
      .filter((invoiceId) => /^in_/.test(String(invoiceId || ""))),
  );
}

async function createSubscriptionThroughPortal(request, fixture, data) {
  const accessToken = await login(request, fixture.credentials);
  const response = await request.post(
    `${API_ORIGIN}/api/portal/subscriptions`,
    {
      headers: portalHeaders(accessToken),
      data: {
        frequency: "weekly",
        deliveryAddressId: fixture.addressId,
        notes: `Stripe CLI webhook E2E ${fixture.scenarioId}`,
        ...data,
      },
      timeout: 90_000,
    },
  );
  const body = await response.json().catch(() => null);

  expect(response.status(), body?.message || JSON.stringify(body)).toBe(201);
  expect(body?.success, JSON.stringify(body)).toBe(true);
  expect(body?.data?.subscription?._id).toBeTruthy();
  expect(body?.data?.subscription?.stripeSubscriptionId).toMatch(/^sub_/);

  return body.data.subscription;
}

async function pollForExactWebhookState(
  request,
  subscriptionId,
  expectedOrderCount,
) {
  let exactSince = null;
  let lastState = null;

  await expect
    .poll(
      async () => {
        lastState = await getState(request, subscriptionId);
        const orders = lastState.orders;
        const paid = paidOrders(lastState);
        const generated = generatedDeliveries(lastState);
        const orderIds = new Set(orders.map((order) => id(order._id)));
        const invoiceIds = realInvoiceIds(orders);
        const exact =
          orders.length === expectedOrderCount &&
          paid.length === expectedOrderCount &&
          generated.length === expectedOrderCount &&
          generated.every((delivery) => orderIds.has(id(delivery.order))) &&
          invoiceIds.size === 1;

        if (!exact) {
          exactSince = null;
        } else if (exactSince === null) {
          exactSince = Date.now();
        }

        return {
          orderCount: orders.length,
          paidOrderCount: paid.length,
          generatedDeliveryCount: generated.length,
          linkedGeneratedDeliveryCount: generated.filter((delivery) =>
            orderIds.has(id(delivery.order)),
          ).length,
          realInvoiceCount: invoiceIds.size,
          stable:
            exactSince !== null &&
            Date.now() - exactSince >= STABLE_EXACT_STATE_MS,
        };
      },
      {
        timeout: 75_000,
        intervals: [500, 750, 1_000, 1_000],
        message:
          "A real Stripe-signed invoice.payment_succeeded event did not produce the exact, stable fulfillment state",
      },
    )
    .toEqual({
      orderCount: expectedOrderCount,
      paidOrderCount: expectedOrderCount,
      generatedDeliveryCount: expectedOrderCount,
      linkedGeneratedDeliveryCount: expectedOrderCount,
      realInvoiceCount: 1,
      stable: true,
    });

  // Read once more after the stability window. Exact assertions below remain
  // sensitive to duplicated webhook processing rather than accepting >= counts.
  return getState(request, subscriptionId);
}

function expectRealInvoiceLinkage(state, orders, expectedAmountMinor) {
  expect(orders.length).toBeGreaterThan(0);

  const invoiceIds = [...new Set(orders.map((order) => order.stripeInvoiceId))];
  const paymentIntentIds = [
    ...new Set(orders.map((order) => order.stripePaymentIntentId)),
  ];

  expect(invoiceIds).toHaveLength(1);
  expect(invoiceIds[0]).toMatch(/^in_/);
  expect(paymentIntentIds).toHaveLength(1);
  expect(paymentIntentIds[0]).toMatch(/^pi_/);

  const remoteIntent = state.stripe.paymentIntents.find(
    (intent) => intent.id === paymentIntentIds[0],
  );
  expect(remoteIntent).toMatchObject({
    id: paymentIntentIds[0],
    invoice: invoiceIds[0],
    amount: expectedAmountMinor,
    amountReceived: expectedAmountMinor,
    currency: "gbp",
    status: "succeeded",
  });

  return invoiceIds[0];
}

test.describe("real Stripe-signed subscription invoice webhooks", () => {
  test.skip(
    process.env.E2E_USE_STRIPE_CLI !== "1",
    "Set E2E_USE_STRIPE_CLI=1 to run real Stripe-signed webhook tests",
  );

  test.beforeEach(async ({ request }) => {
    await reset(request);
  });

  test.afterAll(async ({ request }) => {
    await reset(request);
  });

  test("initial weekly single-day invoice creates exactly one paid order and one generated delivery", async ({
    request,
  }) => {
    const fixture = await createFixture(request, {
      cadence: "weekly-single-day",
      timing: "before-cutoff",
      createSubscription: false,
    });
    const requestedItems = [
      { variantId: fixture.variants.MILK.id, quantity: 2 },
    ];

    const subscription = await createSubscriptionThroughPortal(
      request,
      fixture,
      {
        preferredDeliveryDay: fixture.deliveryDays[0],
        preferredDeliveryDays: fixture.deliveryDays,
        items: requestedItems,
      },
    );
    const state = await pollForExactWebhookState(
      request,
      subscription._id,
      1,
    );

    expect(state.orders).toHaveLength(1);
    expect(paidOrders(state)).toHaveLength(1);
    expect(generatedDeliveries(state)).toHaveLength(1);

    const order = state.orders[0];
    const delivery = generatedDeliveries(state)[0];
    expect(order).toMatchObject({
      status: "paid",
      deliveryStatus: "ordered",
      orderType: "subscription_generated",
      subscription: subscription._id,
      total: 11,
      amountPaid: 11,
    });
    expect(orderItems(order.items)).toEqual(expectedItems(requestedItems, fixture));
    expect(localWeekday(order.deliveryDate)).toBe(fixture.deliveryDays[0]);
    expect(id(delivery.order)).toBe(id(order._id));
    expect(localWeekday(delivery.scheduledDate)).toBe(fixture.deliveryDays[0]);

    const invoiceId = expectRealInvoiceLinkage(state, [order], 1_100);
    expect(order.stripeInvoiceId).toBe(invoiceId);
  });

  test("one initial weekly multi-day invoice creates exactly two day-plan orders sharing its real invoice ID", async ({
    request,
  }) => {
    const fixture = await createFixture(request, {
      cadence: "weekly-multi-day",
      timing: "before-cutoff",
      createSubscription: false,
    });
    const [firstDay, secondDay] = fixture.deliveryDays;
    const requestedPlans = [
      {
        day: firstDay,
        items: [{ variantId: fixture.variants.MILK.id, quantity: 2 }],
      },
      {
        day: secondDay,
        items: [
          { variantId: fixture.variants.BUTTER.id, quantity: 1 },
          { variantId: fixture.variants.EGGS.id, quantity: 1 },
        ],
      },
    ];

    const subscription = await createSubscriptionThroughPortal(
      request,
      fixture,
      {
        preferredDeliveryDay: firstDay,
        preferredDeliveryDays: fixture.deliveryDays,
        deliveryDayPlans: requestedPlans,
      },
    );
    const state = await pollForExactWebhookState(
      request,
      subscription._id,
      2,
    );

    expect(state.orders).toHaveLength(2);
    expect(paidOrders(state)).toHaveLength(2);
    expect(generatedDeliveries(state)).toHaveLength(2);

    const expectedByDay = new Map(
      requestedPlans.map((plan) => [
        plan.day,
        expectedItems(plan.items, fixture),
      ]),
    );
    const ordersByDay = new Map(
      state.orders.map((order) => [localWeekday(order.deliveryDate), order]),
    );
    expect([...ordersByDay.keys()].sort()).toEqual(
      [...expectedByDay.keys()].sort(),
    );

    for (const [day, expectedPlanItems] of expectedByDay) {
      const order = ordersByDay.get(day);
      expect(order, `Missing webhook-generated order for weekday ${day}`).toBeTruthy();
      expect(order).toMatchObject({
        status: "paid",
        deliveryStatus: "ordered",
        orderType: "subscription_generated",
        subscription: subscription._id,
      });
      expect(orderItems(order.items)).toEqual(expectedPlanItems);
      expect(Number(order.total)).toBe(
        expectedPlanItems.reduce(
          (total, item) => total + item.unitPrice * item.quantity,
          0,
        ) + 1,
      );
      expect(Number(order.amountPaid)).toBe(Number(order.total));
    }

    const invoiceId = expectRealInvoiceLinkage(state, state.orders, 1_700);
    expect(
      state.orders.every((order) => order.stripeInvoiceId === invoiceId),
    ).toBe(true);
    expect(
      new Set(state.orders.map((order) => order.stripePaymentIntentId)).size,
    ).toBe(1);

    const orderIds = new Set(state.orders.map((order) => id(order._id)));
    expect(
      generatedDeliveries(state).every((delivery) =>
        orderIds.has(id(delivery.order)),
      ),
    ).toBe(true);
  });

  test("a successful invoice retry reactivates a payment-failure pause and creates the paid order", async ({
    request,
  }) => {
    const fixture = await createFixture(request, {
      cadence: "weekly-single-day",
      timing: "before-cutoff",
    });
    const retry = await preparePaymentRetry(request, fixture.subscriptionId);
    const before = await getState(request, fixture.subscriptionId);

    await deliverSignedInvoiceEvent(
      request,
      fixture.subscriptionId,
      "invoice.payment_failed",
      retry.invoiceId,
    );

    await expect
      .poll(
        async () => {
          const state = await getState(request, fixture.subscriptionId);
          return {
            status: state.subscription.status,
            pauseReason: state.subscription.pauseReason,
            stripePauseBehavior:
              state.stripe.remoteSubscription.pauseCollection?.behavior || null,
            orderCount: state.orders.length,
          };
        },
        { message: "The failed invoice did not pause local and Stripe billing" },
      )
      .toEqual({
        status: "paused",
        pauseReason: "payment_failed",
        stripePauseBehavior: "void",
        orderCount: before.orders.length,
      });

    await deliverSignedInvoiceEvent(
      request,
      fixture.subscriptionId,
      "invoice.payment_succeeded",
      retry.invoiceId,
    );

    await expect
      .poll(
        async () => {
          const state = await getState(request, fixture.subscriptionId);
          const retryOrders = state.orders.filter(
            (order) => order.stripeInvoiceId === retry.invoiceId,
          );
          return {
            status: state.subscription.status,
            pauseReason: state.subscription.pauseReason,
            pausedAt: state.subscription.pausedAt,
            pausedUntil: state.subscription.pausedUntil,
            stripePause: state.stripe.remoteSubscription.pauseCollection,
            orderCount: state.orders.length,
            retryOrderCount: retryOrders.length,
            retryOrderStatus: retryOrders[0]?.status || null,
            retryOrderDeliveryDate: retryOrders[0]?.deliveryDate || null,
          };
        },
        {
          timeout: 30_000,
          message:
            "The successful retry did not restore the subscription and fulfillment state",
        },
      )
      .toEqual({
        status: "active",
        pauseReason: null,
        pausedAt: null,
        pausedUntil: null,
        stripePause: null,
        orderCount: before.orders.length + 1,
        retryOrderCount: 1,
        retryOrderStatus: "paid",
        retryOrderDeliveryDate: new Date(retry.deliveryDate).toISOString(),
      });
  });
});
