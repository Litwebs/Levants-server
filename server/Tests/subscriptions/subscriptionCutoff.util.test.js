"use strict";

const {
  computeSubscriptionCutoffDate,
  zonedDateTimeToUtc,
} = require("../../utils/subscriptionCutoff.util");

describe("subscription cutoff timezone utility", () => {
  const settings = {
    cutoffDaysBefore: 2,
    cutoffTime: "22:00",
  };

  it("uses Europe/London summer time instead of the host timezone", () => {
    const cutoff = computeSubscriptionCutoffDate(
      new Date("2026-07-05T08:00:00.000Z"),
      settings,
      "Europe/London",
    );

    expect(cutoff.toISOString()).toBe("2026-07-03T21:00:00.000Z");
  });

  it("uses Europe/London winter time instead of a fixed UTC offset", () => {
    const cutoff = computeSubscriptionCutoffDate(
      new Date("2026-01-11T09:00:00.000Z"),
      settings,
      "Europe/London",
    );

    expect(cutoff.toISOString()).toBe("2026-01-09T22:00:00.000Z");
  });

  it("chooses the earlier instant for a repeated autumn wall clock", () => {
    const instant = zonedDateTimeToUtc(
      {
        year: 2026,
        month: 10,
        day: 25,
        hour: 1,
        minute: 30,
      },
      "Europe/London",
    );

    expect(instant.toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it("matches compatible JavaScript behavior for a skipped spring wall clock", () => {
    const instant = zonedDateTimeToUtc(
      {
        year: 2026,
        month: 3,
        day: 29,
        hour: 1,
        minute: 30,
      },
      "Europe/London",
    );

    expect(instant.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });
});
