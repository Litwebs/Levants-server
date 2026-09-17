"use strict";

const {
  pauseSubscriptionSchema,
} = require("../../validators/portal.validators");

describe("pause subscription request validation", () => {
  test("accepts an explicit store-credit settlement method", () => {
    const { error, value } = pauseSubscriptionSchema.validate({
      resumeOn: "2026-10-01T00:00:00.000Z",
      refundMethod: "credit",
    });

    expect(error).toBeUndefined();
    expect(value.refundMethod).toBe("credit");
  });

  test("accepts an explicit card-refund settlement method", () => {
    const { error, value } = pauseSubscriptionSchema.validate({
      resumeOn: "2026-10-01T00:00:00.000Z",
      refundMethod: "refund",
    });

    expect(error).toBeUndefined();
    expect(value.refundMethod).toBe("refund");
  });

  test("keeps refundMethod optional so the existing service default is preserved", () => {
    const { error, value } = pauseSubscriptionSchema.validate({
      resumeOn: "2026-10-01T00:00:00.000Z",
    });

    expect(error).toBeUndefined();
    expect(value.refundMethod).toBeUndefined();
  });

  test("rejects unsupported settlement methods", () => {
    const { error } = pauseSubscriptionSchema.validate({
      resumeOn: "2026-10-01T00:00:00.000Z",
      refundMethod: "cash",
    });

    expect(error).toBeDefined();
    expect(error.details[0].path).toEqual(["refundMethod"]);
  });

  test("leaves resume-date business validation to the existing service", () => {
    const missing = pauseSubscriptionSchema.validate({ refundMethod: "credit" });
    const invalid = pauseSubscriptionSchema.validate({
      resumeOn: "not-a-date",
      refundMethod: "credit",
    });

    expect(missing.error).toBeUndefined();
    expect(invalid.error).toBeUndefined();
    expect(invalid.value.resumeOn).toBe("not-a-date");
  });

  test("rejects unknown pause request fields", () => {
    const { error } = pauseSubscriptionSchema.validate({
      resumeOn: "2026-10-01",
      refundMethod: "credit",
      unexpected: true,
    });

    expect(error).toBeDefined();
    expect(error.details[0].path).toEqual(["unexpected"]);
  });
});
