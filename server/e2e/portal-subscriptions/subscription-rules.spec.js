"use strict";

const { test, expect } = require("@playwright/test");
const {
  ACTIONS,
  CADENCES,
  FUNDS,
  RULE_MATRIX,
  TEST_FAMILIES,
} = require("./rule-matrix");
const {
  API_ORIGIN,
  autoResume,
  createFixture,
  crossCutoff,
  finalizeCancellation,
  getState,
  login,
  portalHeaders,
  reset,
  setPaymentOutcome,
} = require("../support/e2e-client");

test("scheduled cancellation keeps the locked delivery, then finalizes once and only once", async ({
  request,
}) => {
  await reset(request);
  const fixture = await createFixture(request, {
    cadence: CADENCES.WEEKLY_SINGLE_DAY,
    timing: "after-cutoff",
    action: ACTIONS.CANCEL,
    funds: FUNDS.FUNDED,
  });
  const token = await login(request, fixture.credentials);

  const response = await request.post(
    `${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}/cancel`,
    {
      headers: portalHeaders(token),
      data: { reason: "lifecycle finalizer test", refundMethod: "refund" },
    },
  );
  expect(response.ok()).toBe(true);

  const scheduled = await getState(request, fixture.subscriptionId);
  expect(scheduled.subscription.status).toBe("active");
  expect(scheduled.subscription.isCancellationScheduled).toBe(true);
  const locked = deliveryForDate(scheduled, fixture.lockedDeliveryDate);
  expect(["generated", "scheduled"]).toContain(locked?.status);

  const duringLockedDay = new Date(fixture.lockedDeliveryDate);
  duringLockedDay.setHours(18, 0, 0, 0);
  const early = await finalizeCancellation(
    request,
    fixture.subscriptionId,
    duringLockedDay.toISOString(),
  );
  expect(early.finalized).toBe(0);

  const nextDay = new Date(fixture.lockedDeliveryDate);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(6, 0, 0, 0);
  const first = await finalizeCancellation(
    request,
    fixture.subscriptionId,
    nextDay.toISOString(),
  );
  const duplicate = await finalizeCancellation(
    request,
    fixture.subscriptionId,
    nextDay.toISOString(),
  );
  expect(first.finalized).toBe(1);
  expect(duplicate.finalized).toBe(0);

  const finalized = await getState(request, fixture.subscriptionId);
  expect(finalized.subscription.status).toBe("cancelled");
  expect(finalized.subscription.isCancellationScheduled).toBe(false);
  expect(finalized.subscription.cancellationEffectiveAfter).toBeNull();
  expect(orderForDate(finalized, fixture.lockedDeliveryDate)?.status).toBe(
    "paid",
  );
});

test("resume restores only partially refunded payment backing", async ({
  request,
}) => {
  await reset(request);
  const partialRefundMinor = 400;
  const fixture = await createFixture(request, {
    cadence: CADENCES.WEEKLY_SINGLE_DAY,
    timing: "resume-open",
    lifecycle: "resume",
    action: ACTIONS.RESUME,
    funds: FUNDS.FUNDED,
    resumeRequiresPayment: true,
    resumeRefundMinor: partialRefundMinor,
  });
  const before = await getState(request, fixture.subscriptionId);

  const result = await autoResume(request, fixture.subscriptionId);
  expect(result.ok, result.error).toBe(true);
  expect(result.resumed).toBe(1);

  const after = await getState(request, fixture.subscriptionId);
  expect(after.subscription.status).toBe("active");
  expect(
    successfulModificationAmount(after) - successfulModificationAmount(before),
  ).toBe(partialRefundMinor);
});

const ADD_FAMILIES = new Set([
  TEST_FAMILIES.ADD_BEFORE_FUNDED,
  TEST_FAMILIES.ADD_BEFORE_DECLINED,
  TEST_FAMILIES.ADD_AFTER_FUNDED,
  TEST_FAMILIES.ADD_AFTER_DECLINED,
]);
const BEFORE_FAMILIES = new Set([
  TEST_FAMILIES.ADD_BEFORE_FUNDED,
  TEST_FAMILIES.ADD_BEFORE_DECLINED,
  TEST_FAMILIES.REMOVE_BEFORE,
  TEST_FAMILIES.CANCEL_BEFORE,
  TEST_FAMILIES.PAUSE_BEFORE,
]);

function id(value) {
  return String(value || "");
}

function dayKey(value) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type) =>
    parts.find((candidate) => candidate.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function quantity(items, variantId) {
  const item = (items || []).find(
    (candidate) => id(candidate.variant) === id(variantId),
  );
  return Number(item?.quantity || 0);
}

function planQuantity(subscription, day, variantId, pending = false) {
  const owner = pending ? subscription.pendingChanges : subscription;
  const plans = owner?.deliveryDayPlans || [];
  const plan = plans.find((candidate) => Number(candidate.day) === Number(day));
  return quantity(plan?.items || [], variantId);
}

function orderForDate(state, date) {
  return state.orders.find(
    (order) => dayKey(order.deliveryDate) === dayKey(date),
  );
}

function orderSnapshot(order) {
  if (!order) return null;
  return {
    id: id(order._id),
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    subtotal: Number(order.subtotal),
    total: Number(order.total),
    amountPaid: Number(order.amountPaid),
    items: (order.items || [])
      .map((item) => ({
        product: id(item.product),
        variant: id(item.variant),
        name: item.name,
        sku: item.sku,
        price: Number(item.price),
        quantity: Number(item.quantity),
        subtotal: Number(item.subtotal),
      }))
      .sort((left, right) => left.variant.localeCompare(right.variant)),
    refund: order.refund || null,
    refunds: order.refunds || [],
  };
}

function orderSnapshots(orders) {
  return (orders || [])
    .map(orderSnapshot)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function deliveryForDate(state, date) {
  return state.deliveries.find(
    (delivery) => dayKey(delivery.scheduledDate) === dayKey(date),
  );
}

function modificationIntents(state) {
  return state.stripe.paymentIntents.filter(
    (intent) => intent.metadata?.type === "subscription_modification",
  );
}

function relevantRefunds(state) {
  return state.stripe.refunds.filter(
    (refund) =>
      id(refund.metadata?.subscriptionId) === id(state.subscription._id),
  );
}

function successfulModificationAmount(state) {
  return modificationIntents(state)
    .filter((intent) => intent.status === "succeeded")
    .reduce((sum, intent) => sum + Number(intent.amount || 0), 0);
}

function successfulIntentSnapshot(state) {
  return state.stripe.paymentIntents
    .filter((intent) => intent.status === "succeeded")
    .map((intent) => ({
      id: intent.id,
      amount: Number(intent.amount),
      amountReceived: Number(intent.amountReceived),
      currency: intent.currency,
      invoice: intent.invoice || null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function refundAmount(state) {
  return relevantRefunds(state)
    .filter((refund) => refund.status === "succeeded")
    .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
}

function creditAmount(state) {
  return state.credits.reduce(
    (sum, transaction) => sum + Math.max(0, Number(transaction.amount || 0)),
    0,
  );
}

function requestedQuantity(rule, baseline) {
  switch (rule.action) {
    case ACTIONS.ADD_ITEM:
      return 1;
    case ACTIONS.INCREASE_QUANTITY:
      return baseline + 1;
    case ACTIONS.REMOVE_ITEM:
      return 0;
    case ACTIONS.DECREASE_QUANTITY:
      return baseline - 1;
    default:
      return baseline;
  }
}

function signedItemDeltaMinor(rule, fixture) {
  const amount = fixture.expectedDeltaMinor[rule.action];
  return [ACTIONS.REMOVE_ITEM, ACTIONS.DECREASE_QUANTITY].includes(rule.action)
    ? -amount
    : amount;
}

function assertChangedOrder(rule, fixture, beforeOrder, afterOrder, expected) {
  expect.soft(beforeOrder).toBeTruthy();
  expect.soft(afterOrder).toBeTruthy();
  if (!beforeOrder || !afterOrder) return;

  const target = actionVariant(fixture, rule.action);
  const deltaMajor = signedItemDeltaMinor(rule, fixture) / 100;
  expect.soft(id(afterOrder._id)).toBe(id(beforeOrder._id));
  expect.soft(afterOrder.deliveryStatus).toBe(beforeOrder.deliveryStatus);
  expect.soft(afterOrder.status).toBe(
    deltaMajor < 0 ? "partially_refunded" : beforeOrder.status,
  );
  expect.soft(quantity(afterOrder.items, target.id)).toBe(expected);

  const expectedVariants = new Set(
    (beforeOrder.items || []).map((item) => id(item.variant)),
  );
  if (expected > 0) expectedVariants.add(id(target.id));
  else expectedVariants.delete(id(target.id));
  expect
    .soft((afterOrder.items || []).map((item) => id(item.variant)).sort())
    .toEqual([...expectedVariants].sort());

  for (const item of beforeOrder.items || []) {
    if (id(item.variant) === id(target.id)) continue;
    expect.soft(quantity(afterOrder.items, item.variant)).toBe(
      Number(item.quantity),
    );
  }

  expect.soft(Number(afterOrder.total)).toBe(
    Number(beforeOrder.total) + deltaMajor,
  );
  expect.soft(Number(afterOrder.amountPaid)).toBe(
    Number(beforeOrder.amountPaid) + deltaMajor,
  );
}

function actionVariant(fixture, action) {
  if (action === ACTIONS.ADD_ITEM) return fixture.variants.EGGS;
  if (action === ACTIONS.REMOVE_ITEM) return fixture.variants.BUTTER;
  return fixture.variants.MILK;
}

function mutateDayPlans(state, fixture, rule) {
  const target = actionVariant(fixture, rule.action);
  return state.subscription.deliveryDayPlans.map((plan) => {
    let items = plan.items.map((item) => ({
      variantId: id(item.variant),
      quantity: Number(item.quantity),
    }));

    if (rule.action === ACTIONS.ADD_ITEM) {
      items.push({ variantId: target.id, quantity: 1 });
    } else if (rule.action === ACTIONS.REMOVE_ITEM) {
      items = items.filter((item) => item.variantId !== target.id);
    } else {
      items = items.map((item) =>
        item.variantId === target.id
          ? {
              ...item,
              quantity:
                item.quantity +
                (rule.action === ACTIONS.INCREASE_QUANTITY ? 1 : -1),
            }
          : item,
      );
    }
    return { day: Number(plan.day), items };
  });
}

async function performItemAction(request, token, fixture, rule, before) {
  const headers = portalHeaders(token);
  const base = `${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}`;

  if (fixture.cadence === CADENCES.WEEKLY_MULTI_DAY) {
    return request.patch(base, {
      headers,
      data: {
        preferredDeliveryDays: fixture.deliveryDays,
        deliveryDayPlans: mutateDayPlans(before, fixture, rule),
        changedDeliveryDays: fixture.deliveryDays,
        refundMethod: "refund",
      },
      timeout: 60_000,
    });
  }

  if (rule.action === ACTIONS.ADD_ITEM) {
    return request.post(`${base}/items`, {
      headers,
      data: { variantId: fixture.variants.EGGS.id, quantity: 1 },
      timeout: 60_000,
    });
  }
  if (rule.action === ACTIONS.INCREASE_QUANTITY) {
    return request.patch(`${base}/items/${fixture.variants.MILK.itemId}`, {
      headers,
      data: { quantity: 3 },
      timeout: 60_000,
    });
  }
  if (rule.action === ACTIONS.REMOVE_ITEM) {
    return request.delete(`${base}/items/${fixture.variants.BUTTER.itemId}`, {
      headers,
      data: { refundMethod: "refund" },
      timeout: 60_000,
    });
  }
  return request.patch(`${base}/items/${fixture.variants.MILK.itemId}`, {
    headers,
    data: { quantity: 1, refundMethod: "refund" },
    timeout: 60_000,
  });
}

async function performLifecycleAction(request, token, fixture, rule) {
  if (rule.action === ACTIONS.RESUME) {
    return autoResume(request, fixture.subscriptionId);
  }

  const headers = portalHeaders(token);
  const base = `${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}`;
  if (rule.action === ACTIONS.CANCEL) {
    return request.post(`${base}/cancel`, {
      headers,
      data: {
        reason: `Workbook row ${rule.workbookRow}`,
        refundMethod: "refund",
      },
      timeout: 60_000,
    });
  }
  return request.post(`${base}/pause`, {
    headers,
    data: { resumeOn: fixture.resumeOn },
    timeout: 60_000,
  });
}

function fixtureOptions(rule) {
  let timing = BEFORE_FAMILIES.has(rule.family)
    ? "before-cutoff"
    : "after-cutoff";
  if (rule.family === TEST_FAMILIES.RESUME_OPEN) timing = "resume-open";
  if (rule.family === TEST_FAMILIES.RESUME_LOCKED) timing = "resume-locked";
  return {
    cadence: rule.cadence,
    timing,
    funds:
      rule.funds === FUNDS.INSUFFICIENT ? "insufficient" : "sufficient",
    lifecycle: rule.action === ACTIONS.RESUME ? "resume" : undefined,
  };
}

function expectedAffectedDeliveryCount(rule, fixture) {
  if (fixture.cadence !== CADENCES.WEEKLY_MULTI_DAY) return 1;
  return BEFORE_FAMILIES.has(rule.family) ? 2 : 1;
}

function assertItemScope(rule, fixture, before, after) {
  const target = actionVariant(fixture, rule.action);
  const baseline = quantity(before.subscription.items, target.id);
  const expected = requestedQuantity(rule, baseline);
  const isBefore = BEFORE_FAMILIES.has(rule.family);
  // Multi-day changes are settled per open delivery day. A request spanning a
  // locked and an open day therefore still has one immediate payment to make.
  const hasImmediateSettlement =
    isBefore || fixture.cadence === CADENCES.WEEKLY_MULTI_DAY;
  const declined =
    hasImmediateSettlement && rule.funds === FUNDS.INSUFFICIENT;

  if (fixture.cadence !== CADENCES.WEEKLY_MULTI_DAY) {
    if (declined) {
      expect.soft(quantity(after.subscription.items, target.id)).toBe(baseline);
      expect.soft(after.subscription.pendingChanges).toBeNull();
      expect.soft(after.stripe.remoteSubscription.currentPriceId).toBe(
        before.stripe.remoteSubscription.currentPriceId,
      );
      expect.soft(orderSnapshots(after.orders)).toEqual(
        orderSnapshots(before.orders),
      );
      return;
    }

    if (isBefore) {
      expect.soft(quantity(after.subscription.items, target.id)).toBe(expected);
      expect.soft(after.subscription.pendingChanges).toBeNull();
      assertChangedOrder(
        rule,
        fixture,
        orderForDate(before, fixture.deliveryDates[0]),
        orderForDate(after, fixture.deliveryDates[0]),
        expected,
      );
    } else {
      expect.soft(quantity(after.subscription.items, target.id)).toBe(baseline);
      expect
        .soft(quantity(after.subscription.pendingChanges?.items, target.id))
        .toBe(expected);
      const lockedOrder = orderForDate(after, fixture.lockedDeliveryDate);
      const priorLockedOrder = orderForDate(before, fixture.lockedDeliveryDate);
      expect.soft(orderSnapshot(lockedOrder)).toEqual(
        orderSnapshot(priorLockedOrder),
      );
      expect
        .soft(dayKey(after.subscription.pendingChanges?.effectiveFrom))
        .toBe(dayKey(fixture.firstOpenDeliveryDate));
    }
    return;
  }

  const [firstDay, secondDay] = fixture.deliveryDays;
  const firstBaseline = planQuantity(before.subscription, firstDay, target.id);
  const secondBaseline = planQuantity(before.subscription, secondDay, target.id);
  const firstExpected = requestedQuantity(rule, firstBaseline);
  const secondExpected = requestedQuantity(rule, secondBaseline);

  if (declined) {
    expect.soft(planQuantity(after.subscription, firstDay, target.id)).toBe(
      firstBaseline,
    );
    expect.soft(planQuantity(after.subscription, secondDay, target.id)).toBe(
      secondBaseline,
    );
    expect.soft(after.subscription.pendingChanges).toBeNull();
    expect.soft(orderSnapshots(after.orders)).toEqual(
      orderSnapshots(before.orders),
    );
    return;
  }

  if (isBefore) {
    expect.soft(planQuantity(after.subscription, firstDay, target.id)).toBe(
      firstExpected,
    );
    expect.soft(planQuantity(after.subscription, secondDay, target.id)).toBe(
      secondExpected,
    );
    expect.soft(after.subscription.pendingChanges).toBeNull();
    const firstOrder = orderForDate(after, fixture.deliveryDates[0]);
    const secondOrder = orderForDate(after, fixture.deliveryDates[1]);
    assertChangedOrder(
      rule,
      fixture,
      orderForDate(before, fixture.deliveryDates[0]),
      firstOrder,
      firstExpected,
    );
    assertChangedOrder(
      rule,
      fixture,
      orderForDate(before, fixture.deliveryDates[1]),
      secondOrder,
      secondExpected,
    );
    return;
  }

  expect.soft(planQuantity(after.subscription, firstDay, target.id)).toBe(
    firstBaseline,
  );
  expect.soft(planQuantity(after.subscription, secondDay, target.id)).toBe(
    secondExpected,
  );
  expect
    .soft(planQuantity(after.subscription, firstDay, target.id, true))
    .toBe(firstExpected);
  expect
    .soft(planQuantity(after.subscription, secondDay, target.id, true))
    .toBe(secondExpected);

  const lockedBefore = orderForDate(before, fixture.lockedDeliveryDate);
  const lockedAfter = orderForDate(after, fixture.lockedDeliveryDate);
  expect.soft(orderSnapshot(lockedAfter)).toEqual(orderSnapshot(lockedBefore));
  const openOrder = orderForDate(after, fixture.firstOpenDeliveryDate);
  assertChangedOrder(
    rule,
    fixture,
    orderForDate(before, fixture.firstOpenDeliveryDate),
    openOrder,
    secondExpected,
  );
}

function assertItemFinancials(rule, fixture, after) {
  const perDelivery = fixture.expectedDeltaMinor[rule.action];
  const affected = expectedAffectedDeliveryCount(rule, fixture);

  if (ADD_FAMILIES.has(rule.family)) {
    const hasImmediateSettlement =
      BEFORE_FAMILIES.has(rule.family) ||
      fixture.cadence === CADENCES.WEEKLY_MULTI_DAY;
    const expectedCharge =
      hasImmediateSettlement && rule.funds !== FUNDS.INSUFFICIENT
        ? perDelivery * affected
        : 0;
    expect.soft(successfulModificationAmount(after)).toBe(expectedCharge);
    return;
  }

  const isAfter = rule.family === TEST_FAMILIES.REMOVE_AFTER;
  const expectedRefund =
    isAfter && fixture.cadence !== CADENCES.WEEKLY_MULTI_DAY
      ? 0
      : perDelivery * affected;
  expect.soft(refundAmount(after)).toBe(expectedRefund);
  expect.soft(creditAmount(after)).toBe(0);
}

async function assertRetryRecalculatesEligibility({
  request,
  token,
  rule,
  fixture,
  afterDecline,
}) {
  await crossCutoff(request, fixture.subscriptionId);
  await setPaymentOutcome(request, fixture.subscriptionId, "sufficient");
  const beforeRetry = await getState(request, fixture.subscriptionId);
  const response = await performItemAction(
    request,
    token,
    fixture,
    rule,
    beforeRetry,
  );
  const body = await response.json().catch(() => ({}));
  expect.soft(response.ok(), body?.message).toBe(true);

  const afterRetry = await getState(request, fixture.subscriptionId);
  const target = actionVariant(fixture, rule.action);
  // The retry deliberately crosses cut-off. At that point the change is
  // staged for the next bill rather than collected as a one-off charge.
  const expectedCharge = 0;
  expect
    .soft(
      successfulModificationAmount(afterRetry) -
        successfulModificationAmount(beforeRetry),
    )
    .toBe(expectedCharge);

  if (fixture.cadence !== CADENCES.WEEKLY_MULTI_DAY) {
    const baseline = quantity(afterDecline.subscription.items, target.id);
    const expected = requestedQuantity(rule, baseline);
    expect.soft(quantity(afterRetry.subscription.items, target.id)).toBe(
      baseline,
    );
    expect
      .soft(quantity(afterRetry.subscription.pendingChanges?.items, target.id))
      .toBe(expected);
    expect
      .soft(dayKey(afterRetry.subscription.pendingChanges?.effectiveFrom))
      .toBe(
        dayKey(
          fixture.deliveryDates[
            rule.family === TEST_FAMILIES.ADD_AFTER_DECLINED ? 2 : 1
          ],
        ),
      );
  } else {
    for (const day of fixture.deliveryDays) {
      const baseline = planQuantity(
        afterDecline.subscription,
        day,
        target.id,
      );
      const expected = requestedQuantity(rule, baseline);
      expect
        .soft(planQuantity(afterRetry.subscription, day, target.id))
        .toBe(baseline);
      expect
        .soft(
          planQuantity(afterRetry.subscription, day, target.id, true),
        )
        .toBe(expected);
    }
  }

  for (const lockedOrder of beforeRetry.orders) {
    const afterOrder = afterRetry.orders.find(
      (order) => id(order._id) === id(lockedOrder._id),
    );
    expect.soft(orderSnapshot(afterOrder)).toEqual(orderSnapshot(lockedOrder));
  }

  if (fixture.cadence === CADENCES.WEEKLY_MULTI_DAY) {
    expect
      .soft(dayKey(afterRetry.subscription.pendingChanges?.effectiveFrom))
      .toBe(dayKey(fixture.deliveryDates[1]));
  }
}

function assertCancellation(rule, fixture, after) {
  const isBefore = rule.family === TEST_FAMILIES.CANCEL_BEFORE;
  const initialValuePerPaidDelivery = 1_300;
  const expectedSettlement = isBefore
    ? initialValuePerPaidDelivery * fixture.paidDeliveryCount
    : fixture.cadence === CADENCES.WEEKLY_MULTI_DAY
      ? initialValuePerPaidDelivery
      : 0;

  expect.soft(refundAmount(after)).toBe(expectedSettlement);
  expect.soft(creditAmount(after)).toBe(0);
  expect.soft(after.stripe.remoteSubscription.status).toBe("canceled");

  if (isBefore) {
    expect.soft(after.subscription.status).toBe("cancelled");
    expect
      .soft(after.deliveries.every((delivery) => delivery.status === "cancelled"))
      .toBe(true);
    return;
  }

  expect.soft(after.subscription.isCancellationScheduled).toBe(true);
  const locked = deliveryForDate(after, fixture.lockedDeliveryDate);
  expect.soft(["generated", "scheduled"]).toContain(locked?.status);
  const later = after.deliveries.filter(
    (delivery) =>
      new Date(delivery.scheduledDate) > new Date(fixture.lockedDeliveryDate),
  );
  expect.soft(later.every((delivery) => delivery.status === "cancelled")).toBe(
    true,
  );
}

function assertPause(rule, fixture, after) {
  const isBefore = rule.family === TEST_FAMILIES.PAUSE_BEFORE;
  const initialValuePerPaidDelivery = 1_300;
  const expectedSettlement = isBefore
    ? initialValuePerPaidDelivery * fixture.paidDeliveryCount
    : fixture.cadence === CADENCES.WEEKLY_MULTI_DAY
      ? initialValuePerPaidDelivery
      : 0;

  expect.soft(after.subscription.status).toBe("paused");
  expect.soft(after.stripe.remoteSubscription.pauseCollection?.behavior).toBe(
    "void",
  );
  expect.soft(refundAmount(after)).toBe(expectedSettlement);
  expect.soft(creditAmount(after)).toBe(0);

  if (!isBefore) {
    const locked = deliveryForDate(after, fixture.lockedDeliveryDate);
    expect.soft(["generated", "scheduled"]).toContain(locked?.status);
  }

  const shouldBeSkipped = after.deliveries.filter((delivery) => {
    const date = new Date(delivery.scheduledDate);
    if (!isBefore && date <= new Date(fixture.lockedDeliveryDate)) return false;
    return date < new Date(fixture.resumeOn);
  });
  expect
    .soft(
      shouldBeSkipped.every((delivery) =>
        ["cancelled", "skipped"].includes(delivery.status),
      ),
    )
    .toBe(true);
}

function assertResume(fixture, before, after) {
  expect.soft(dayKey(before.subscription.pausedUntil)).toBe(
    dayKey(fixture.selectedResumeDate),
  );
  expect
    .soft(
      before.deliveries.some(
        (delivery) =>
          new Date(delivery.scheduledDate) <
          new Date(fixture.selectedResumeDate),
      ),
    )
    .toBe(true);
  expect
    .soft(
      before.deliveries.some(
        (delivery) =>
          new Date(delivery.scheduledDate) >=
          new Date(fixture.selectedResumeDate),
      ),
    )
    .toBe(true);
  expect.soft(after.subscription.status).toBe("active");
  expect.soft(after.subscription.pausedAt).toBeNull();
  expect.soft(after.subscription.pausedUntil).toBeNull();
  expect.soft(dayKey(after.subscription.nextDeliveryDate)).toBe(
    dayKey(fixture.firstOpenDeliveryDate),
  );
  expect.soft(after.stripe.remoteSubscription.pauseCollection).toBeNull();
  expect.soft(successfulIntentSnapshot(after)).toEqual(
    successfulIntentSnapshot(before),
  );
}

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test.afterAll(async ({ request }) => {
  await reset(request);
});

for (const rule of RULE_MATRIX) {
  test(`${rule.workbookRowId} | ${rule.frequency} | ${rule.actionLabel}`, async ({
    request,
  }, testInfo) => {
    for (const conflict of rule.conflicts) {
      testInfo.annotations.push({
        type: "workbook-conflict",
        description: conflict,
      });
    }
    if (rule.workbookTested === null) {
      testInfo.annotations.push({
        type: "workbook-status",
        description: "The source workbook has no TESTED value for this row.",
      });
    }
    const fixture = await createFixture(request, fixtureOptions(rule));
    const token = await login(request, fixture.credentials);
    const before = await getState(request, fixture.subscriptionId);

    if (
      rule.action === ACTIONS.ADD_ITEM ||
      rule.action === ACTIONS.INCREASE_QUANTITY ||
      rule.action === ACTIONS.REMOVE_ITEM ||
      rule.action === ACTIONS.DECREASE_QUANTITY
    ) {
      const response = await performItemAction(
        request,
        token,
        fixture,
        rule,
        before,
      );
      const responseBody = await response.json().catch(() => ({}));
      const hasImmediateSettlement =
        BEFORE_FAMILIES.has(rule.family) ||
        fixture.cadence === CADENCES.WEEKLY_MULTI_DAY;
      const shouldFail =
        hasImmediateSettlement &&
        rule.funds === FUNDS.INSUFFICIENT;
      expect.soft(response.ok(), responseBody?.message).toBe(!shouldFail);
      if (shouldFail) {
        expect
          .soft(responseBody?.message || "")
          .toMatch(/declin|fund|charge|payment/i);
      }

      const after = await getState(request, fixture.subscriptionId);
      assertItemScope(rule, fixture, before, after);
      assertItemFinancials(rule, fixture, after);
      if (
        rule.family === TEST_FAMILIES.ADD_BEFORE_DECLINED ||
        (rule.family === TEST_FAMILIES.ADD_AFTER_DECLINED &&
          fixture.cadence === CADENCES.WEEKLY_MULTI_DAY)
      ) {
        await assertRetryRecalculatesEligibility({
          request,
          token,
          rule,
          fixture,
          afterDecline: after,
        });
      }
      return;
    }

    const lifecycleResult = await performLifecycleAction(
      request,
      token,
      fixture,
      rule,
    );
    if (rule.action !== ACTIONS.RESUME) {
      const body = await lifecycleResult.json().catch(() => ({}));
      expect.soft(lifecycleResult.ok(), body?.message).toBe(true);
    } else {
      expect.soft(lifecycleResult.ok, lifecycleResult.error).toBe(true);
      expect.soft(lifecycleResult.resumed).toBe(1);
    }

    const after = await getState(request, fixture.subscriptionId);
    if (rule.action === ACTIONS.CANCEL) {
      assertCancellation(rule, fixture, after);
    } else if (rule.action === ACTIONS.PAUSE) {
      assertPause(rule, fixture, after);
    } else {
      assertResume(fixture, before, after);
    }
  });
}
