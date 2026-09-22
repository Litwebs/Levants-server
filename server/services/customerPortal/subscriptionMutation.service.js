"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");
const SubscriptionMutation = require("../../models/subscriptionMutation.model");
const { Response } = require("../../utils/response.util");

const PROCESSING_LEASE_MS = 2 * 60 * 1000;

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

async function executeIdempotentSubscriptionMutation({
  customerId,
  subscriptionId = null,
  operationId,
  mutationType,
  payload = {},
  reserveResourceId = false,
  execute,
}) {
  if (!operationId) {
    return execute({
      resourceId: subscriptionId || null,
      isReplay: false,
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

  if (!mutation) {
    return inProgressResponse();
  }

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
    const result = await execute({
      resourceId: mutation.resourceId || resourceId,
      isReplay: mutation.attempts > 1,
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
};
