"use strict";

jest.mock("../../models/schedulerLease.model", () => ({
  findOneAndUpdate: jest.fn(),
  deleteOne: jest.fn(),
}));

const SchedulerLease = require("../../models/schedulerLease.model");
const {
  acquireSchedulerLease,
  renewSchedulerLease,
  releaseSchedulerLease,
  withSchedulerLease,
} = require("../../services/schedulerLease.service");

function leanResult(value) {
  return {
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe("scheduler lease service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("acquires, renews, executes and releases a lease for one owner", async () => {
    SchedulerLease.findOneAndUpdate
      .mockReturnValueOnce(
        leanResult({
          _id: "subscription-reconciliation",
          ownerId: "instance-a",
        }),
      )
      .mockReturnValueOnce(
        leanResult({
          _id: "subscription-reconciliation",
          ownerId: "instance-a",
        }),
      );
    SchedulerLease.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const execute = jest.fn(async ({ renew }) => {
      await renew();
      return "done";
    });

    const result = await withSchedulerLease(
      "subscription-reconciliation",
      execute,
      { ownerId: "instance-a", leaseMs: 60_000 },
    );

    expect(result).toEqual({ acquired: true, result: "done" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(SchedulerLease.deleteOne).toHaveBeenCalledWith({
      _id: "subscription-reconciliation",
      ownerId: "instance-a",
    });
  });

  test("does not execute when another instance owns the unexpired lease", async () => {
    const duplicate = new Error("duplicate key");
    duplicate.code = 11000;
    SchedulerLease.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockRejectedValue(duplicate),
    });

    const execute = jest.fn();
    const result = await withSchedulerLease(
      "subscription-reconciliation",
      execute,
      { ownerId: "instance-b", leaseMs: 60_000 },
    );

    expect(result).toEqual({ acquired: false, result: null });
    expect(execute).not.toHaveBeenCalled();
    expect(SchedulerLease.deleteOne).not.toHaveBeenCalled();
  });

  test("renewal fails closed if the current process no longer owns the lease", async () => {
    SchedulerLease.findOneAndUpdate.mockReturnValue(leanResult(null));

    await expect(
      renewSchedulerLease("subscription-daily-maintenance", {
        ownerId: "instance-a",
        leaseMs: 60_000,
      }),
    ).resolves.toBe(false);
  });

  test("release only deletes a lease owned by the caller", async () => {
    SchedulerLease.deleteOne.mockResolvedValue({ deletedCount: 0 });

    await expect(
      releaseSchedulerLease("subscription-daily-maintenance", {
        ownerId: "instance-b",
      }),
    ).resolves.toBe(false);
    expect(SchedulerLease.deleteOne).toHaveBeenCalledWith({
      _id: "subscription-daily-maintenance",
      ownerId: "instance-b",
    });
  });

  test("direct acquire treats a duplicate-key race as a normal miss", async () => {
    const duplicate = new Error("duplicate key");
    duplicate.code = 11000;
    SchedulerLease.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockRejectedValue(duplicate),
    });

    await expect(
      acquireSchedulerLease("subscription-reconciliation", {
        ownerId: "instance-b",
        leaseMs: 60_000,
      }),
    ).resolves.toBeNull();
  });
});
