"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");
const Subscription = require("../../models/subscription.model");
const SubscriptionMutation = require("../../models/subscriptionMutation.model");
const { Response } = require("../../utils/response.util");

const PROCESSING_LEASE_MS = 2 * 60 * 1000;
const CUSTOMER_MUTATION_LEASE_MS = 2 * 60 * 1000;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function requestHash(mutationType, payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize({ mutationType, payload })))
    .digest("hex");
}

function persistedResponse(result) {
  return JSON.parse(JSON.stringify(result));
}

function inProgressResponse() {
  return Response(
    false,
    "This subscription change is already processing. Please retry shortly.",
    { idempotencyInProgress: true, retryable: true },
  );
}

function conflictResponse() {
  return Response(
    false,
    "This operation ID has already been used for a different subscription change.",
    { idempotencyConflict: true },
  );
}

function staleResponse(currentVersion) {
  return Response(
    false,
    "This subscription changed while you were editing it. Refresh the subscription and try again.",
    {
      staleSubscription: true,
      currentVersion,
    },
  );
}

function busyResponse(currentVersion) {
  return Response(
    false,
    "Another subscription change is still being processed. Please try again shortly.",
    {
      subscriptionBusy: true,
      retryable: true,
      currentVersion,
    },
  );
}

async function readSubscriptionConcurrencyState(customerId, subscriptionId) {
  return Subscription.findOne({
    _id: subscriptionId,
    customer: customerId,
  })
    .select("customerVersion +customerMutationLock")
    .lean();
}

async function claimSubscriptionMutationLock({
  customerId,
  subscriptionId,
  expectedVersion,
  operationId,
}) {
  if (!subscriptionId) {
    return { ok: true, lockOperationId: null, currentVersion: null };
  }

  const current = await readSubscriptionConcurrencyState(
    customerId,
    subscriptionId,
  );
  if (!current) {
    return {
      ok: false,
      response: Response(false, "Subscription not found", null),
    };
  }

  const currentVersion = Number(current.customerVersion || 0);
  const hasExpectedVersion =
    expectedVersion !== undefined &&
    expectedVersion !== null &&
    expectedVersion !== "";
  if (
    hasExpectedVersion &&
    Number(expectedVersion) !== currentVersion
  ) {
    return {
      ok: false,
      response: staleResponse(currentVersion),
    };
  }

  const now = new Date();
  const staleBefore = new Date(now.getTime() - CUSTOMER_MUTATION_LEASE_MS);
  const lockOperationId =
    operationId || `legacy:${crypto.randomUUID()}`;
  const activeLock = current.customerMutationLock;
  const lockIsFresh =
    activeLock?.lockedAt &&
    new Date(activeLock.lockedAt).getTime() > staleBefore.getTime();

  if (
    lockIsFresh &&
    activeLock.operationId &&
    activeLock.operationId !== lockOperationId
  ) {
    return {
      ok: false,
      response: busyResponse(currentVersion),
    };
  }

  const versionCondition =
    currentVersion === 0
      ? {
          $or: [
            { customerVersion: 0 },
            { customerVersion: { $exists: false } },
          ],
        }
      : { customerVersion: currentVersion };

  const claimed = await Subscription.findOneAndUpdate(
    {
      _id: subscriptionId,
      customer: customerId,
      $and: [
        versionCondition,
        {
          $or: [
            { customerMutationLock: null },
            { customerMutationLock: { $exists: false } },
            { "customerMutationLock.lockedAt": { $lte: staleBefore } },
            { "customerMutationLock.operationId": lockOperationId },
          ],
        },
      ],
    },
    {
      $set: {
        ...(currentVersion === 0 ? { customerVersion: 0 } : {}),
        customerMutationLock: {
          operationId: lockOperationId,
          lockedAt: now,
        },
      },
    },
    {
      new: true,
      timestamps: false,
      select: "customerVersion +customerMutationLock",
    },
  ).lean();

  if (!claimed) {
    const latest = await readSubscriptionConcurrencyState(
      customerId,
      subscriptionId,
    );
    const latestVersion = Number(latest?.customerVersion || 0);
    if (
      hasExpectedVersion &&
      Number(expectedVersion) !== latestVersion
    ) {
      return {
        ok: false,
        response: staleResponse(latestVersion),
      };
    }
    return {
      ok: false,
      response: busyResponse(latestVersion),
    };
  }

  return {
    ok: true,
    lockOperationId,
    currentVersion,
  };
}

async function releaseSubscriptionMutationLock({
  customerId,
  subscriptionId,
  lockOperationId,
}) {
  if (!subscriptionId || !lockOperationId) return;
  await Subscription.updateOne(
    {
      _id: subscriptionId,
      customer: customerId,
      "customerMutationLock.operationId": lockOperationId,
    },
    { $unset: { customerMutationLock: 1 } },
    { timestamps: false },
  ).catch(() => {});
}

async function executeSubscriptionConcurrencyGuard({
  customerId,
  subscriptionId,
  expectedVersion,
  operationId,
  execute,
}) {
  const claim = await claimSubscriptionMutationLock({
    customerId,
    subscriptionId,
    expectedVersion,
    operationId,
  });
  if (!claim.ok) return claim.response;

  try {
    return await execute();
  } finally {
    await releaseSubscriptionMutationLock({
      customerId,
      subscriptionId,
      lockOperationId: claim.lockOperationId,
    });
  }
}

async function executeIdempotentSubscriptionMutation({
  customerId,
  subscriptionId = null,
  operationId,
  expectedVersion,
  mutationType,
  payload = {},
  reserveResourceId = false,
  execute,
}) {
  if (!operationId) {
    return executeSubscriptionConcurrencyGuard({
      customerId,
      subscriptionId,
      expectedVersion,
      operationId: null,
      execute: () =>
        execute({
          resourceId: subscriptionId || null,
          isReplay: false,
        }),
    });
  }

  const hash = requestHash(mutationType, payload);
  const now = new Date();
  const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);
  const resourceId = subscriptionId
    ? new mongoose.Types.ObjectId(subscriptionId)
    : reserveResourceId
      ? new mongoose.Types.ObjectId()
      : null;

  let mutation;
  let createdNew = false;
  try {
    mutation = await SubscriptionMutation.create({
      customer: customerId,
      subscription: subscriptionId || null,
      resourceId,
      operationId,
      mutationType,
      requestHash: hash,
      status: "processing",
      lockedAt: now,
    });
    createdNew = true;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    mutation = await SubscriptionMutation.findOne({
      customer: customerId,
      operationId,
    });
  }

  if (!mutation) return inProgressResponse();

  if (
    mutation.mutationType !== mutationType ||
    mutation.requestHash !== hash ||
    String(mutation.subscription || "") !== String(subscriptionId || "")
  ) {
    return conflictResponse();
  }

  if (mutation.status === "completed" && mutation.response) {
    return persistedResponse(mutation.response);
  }

  if (
    !createdNew &&
    mutation.status === "processing" &&
    mutation.lockedAt &&
    mutation.lockedAt.getTime() > staleBefore.getTime()
  ) {
    return inProgressResponse();
  }

  if (mutation.status !== "processing" || mutation.lockedAt < staleBefore) {
    const claimed = await SubscriptionMutation.findOneAndUpdate(
      {
        _id: mutation._id,
        $or: [
          { status: "failed" },
          { status: "processing", lockedAt: { $lte: staleBefore } },
        ],
      },
      {
        $set: {
          status: "processing",
          lockedAt: now,
          lastError: null,
        },
        $inc: { attempts: 1 },
      },
      { new: true },
    );
    if (!claimed) {
      const latest = await SubscriptionMutation.findById(mutation._id);
      if (latest?.status === "completed" && latest.response) {
        return persistedResponse(latest.response);
      }
      return inProgressResponse();
    }
    mutation = claimed;
  }

  try {
    const result = await executeSubscriptionConcurrencyGuard({
      customerId,
      subscriptionId,
      expectedVersion,
      operationId,
      execute: () =>
        execute({
          resourceId: mutation.resourceId || resourceId,
          isReplay: mutation.attempts > 1,
        }),
    });

    if (result?.success) {
      await SubscriptionMutation.updateOne(
        { _id: mutation._id },
        {
          $set: {
            status: "completed",
            response: persistedResponse(result),
            completedAt: new Date(),
            lockedAt: new Date(),
            lastError: null,
          },
        },
      );
    } else {
      await SubscriptionMutation.updateOne(
        { _id: mutation._id },
        {
          $set: {
            status: "failed",
            response: result ? persistedResponse(result) : null,
            lockedAt: new Date(),
            lastError: result?.message || "Mutation failed",
          },
        },
      );
    }

    return result;
  } catch (error) {
    await SubscriptionMutation.updateOne(
      { _id: mutation._id },
      {
        $set: {
          status: "failed",
          lockedAt: new Date(),
          lastError: error?.message || String(error),
        },
      },
    ).catch(() => {});
    throw error;
  }
}

module.exports = {
  executeIdempotentSubscriptionMutation,
  executeSubscriptionConcurrencyGuard,
};
