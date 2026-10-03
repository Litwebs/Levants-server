const {
  parseDateRange,
  buildEventDateMatch,
  formatYmdInTimeZone,
} = require("../../utils/analyticsDate.util");

describe("analyticsDate.util", () => {
  test("today is clamped to Europe/London in summer, not host-local time", () => {
    const result = parseDateRange({
      range: "today",
      timeZone: "Europe/London",
      now: new Date("2026-06-15T12:00:00.000Z"),
    });

    expect(result.invalid).toBe(false);
    expect(result.start.toISOString()).toBe("2026-06-14T23:00:00.000Z");
    expect(result.end.toISOString()).toBe("2026-06-15T22:59:59.999Z");
  });

  test("handles the 23-hour DST start day correctly", () => {
    const result = parseDateRange({
      range: "today",
      timeZone: "Europe/London",
      now: new Date("2026-03-29T12:00:00.000Z"),
    });

    expect(result.start.toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(result.end.toISOString()).toBe("2026-03-29T22:59:59.999Z");
  });

  test("handles the 25-hour DST end day correctly", () => {
    const result = parseDateRange({
      range: "today",
      timeZone: "Europe/London",
      now: new Date("2026-10-25T12:00:00.000Z"),
    });

    expect(result.start.toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(result.end.toISOString()).toBe("2026-10-25T23:59:59.999Z");
  });

  test("custom dates are inclusive local calendar days", () => {
    const result = parseDateRange({
      from: "2026-07-01",
      to: "2026-07-02",
      timeZone: "Europe/London",
    });

    expect(result.start.toISOString()).toBe("2026-06-30T23:00:00.000Z");
    expect(result.end.toISOString()).toBe("2026-07-02T22:59:59.999Z");
  });

  test("invalid custom input never silently becomes all-time", () => {
    const match = buildEventDateMatch({
      from: "not-a-date",
      field: "paidAt",
      fallbackField: "createdAt",
    });

    expect(match).toEqual({ _id: { $exists: false } });
  });

  test("payment-date matching falls back to createdAt only when paidAt is absent", () => {
    const match = buildEventDateMatch({
      from: "2026-01-10",
      to: "2026-01-10",
      field: "paidAt",
      fallbackField: "createdAt",
      timeZone: "Europe/London",
    });

    expect(match.$or).toHaveLength(2);
    expect(match.$or[0].paidAt.$gte).toBeInstanceOf(Date);
    expect(match.$or[1].paidAt).toBeNull();
    expect(match.$or[1].createdAt.$lte).toBeInstanceOf(Date);
  });

  test("formats a UTC instant as the correct London calendar date", () => {
    expect(
      formatYmdInTimeZone(
        new Date("2026-06-30T23:30:00.000Z"),
        "Europe/London",
      ),
    ).toBe("2026-07-01");
  });
});
