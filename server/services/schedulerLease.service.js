"use strict";

const crypto = require("crypto");
const os = require("os");
const SchedulerLease = require("../models/schedulerLease.model");

const DEFAULT_LEASE_MS = 30 * 60 * 1000;
const INSTANCE_ID = `${os.hostname()}:${process.pid}:${crypto.randomUUID()}`;

function normalizeLeaseMs(value) {
  return Math.max(30_000, Number(value) || DEFAULT_LEASE_MS);
}

function duplicateKey(error) {
  return error?.code === 11000;
}

async function acquireSchedulerLease(
  key,
  { leaseMs = DEFAULT_LEASE_MS, ownerId = INSTANCE_ID } = {},
) {
  const duration = normalizeLeaseMs(leaseMs);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + duration);

  try {
    const lease = await SchedulerLease.findOneAndUpdate(
      {
        _id: key,
        $or: [
          { expiresAt: { $lte: now } },
          { ownerId },
        ],
      },
      {
        $set: {
          ownerId,
          acquiredAt: now,
          renewedAt: now,
          expiresAt,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    ).lean();

    return lease?.ownerId === ownerId ? lease : null;
  } catch (error) {
    // If another instance owns an unexpired lease, the upsert path races into
    // Mongo's built-in unique _id constraint. That is a normal "not acquired".
    if (duplicateKey(error)) return null;
    throw error;
  }
}

async function renewSchedulerLease(
  key,
  { leaseMs = DEFAULT_LEASE_MS, ownerId = INSTANCE_ID } = {},
) {
  const duration = normalizeLeaseMs(leaseMs);
  const now = new Date();
  const lease = await SchedulerLease.findOneAndUpdate(
    {
      _id: key,
      ownerId,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        renewedAt: now,
        expiresAt: new Date(now.getTime() + duration),
      },
    },
    { new: true },
  ).lean();

  return Boolean(lease);
}

async function releaseSchedulerLease(
  key,
  { ownerId = INSTANCE_ID } = {},
) {
  const result = await SchedulerLease.deleteOne({
    _id: key,
    ownerId,
  });
  return Number(result?.deletedCount || 0) > 0;
}

async function withSchedulerLease(
  key,
  execute,
  {
    leaseMs = DEFAULT_LEASE_MS,
    ownerId = INSTANCE_ID,
  } = {},
) {
  const lease = await acquireSchedulerLease(key, { leaseMs, ownerId });
  if (!lease) {
    return {
      acquired: false,
      result: null,
    };
  }

  const renew = async () => {
    const renewed = await renewSchedulerLease(key, { leaseMs, ownerId });
    if (!renewed) {
      const error = new Error(
        `Scheduler lease "${key}" was lost while the job was running`,
      );
      error.code = "SCHEDULER_LEASE_LOST";
      throw error;
    }
  };

  try {
    return {
      acquired: true,
      result: await execute({ renew, lease }),
    };
  } finally {
    await releaseSchedulerLease(key, { ownerId }).catch(() => {});
  }
}

module.exports = {
  DEFAULT_LEASE_MS,
  acquireSchedulerLease,
  renewSchedulerLease,
  releaseSchedulerLease,
  withSchedulerLease,
};
