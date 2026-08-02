"use strict";

const {
  calculateNextDeliveryDate,
  addFrequencyDays,
} = require("../../services/customerPortal/customerSubscriptions.service");

// Helper: return the day-of-week (0=Sun … 6=Sat) for a Date
const dow = (d) => new Date(d).getDay();

// Helper: create a Date at midnight UTC for a given ISO date string
const day = (iso) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setHours(0, 0, 0, 0);
  return d;
};

describe("calculateNextDeliveryDate — SUB-MULTI-14", () => {
  // Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6

  it("picks the nearest upcoming weekday when today is before both selected days", () => {
    // Today = Thursday (4); selected days = Sun (0) + Wed (3)
    // Distance to Sun = (0 - 4 + 7) % 7 = 3, distance to Wed = (3 - 4 + 7) % 7 = 6
    // Nearest = Sun (+3 days)
    const thursday = day("2026-07-30"); // 2026-07-30 is a Thursday
    const result = calculateNextDeliveryDate(0, "weekly", thursday, [0, 3]);
    expect(dow(result)).toBe(0); // Sunday
  });

  it("picks Wednesday when today is Monday and Sun+Wed are selected", () => {
    // Today = Monday (1); Sun distance = (0-1+7)%7=6, Wed distance = (3-1+7)%7=2
    // Nearest = Wed (+2 days)
    const monday = day("2026-07-27"); // 2026-07-27 is a Monday
    const result = calculateNextDeliveryDate(0, "weekly", monday, [0, 3]);
    expect(dow(result)).toBe(3); // Wednesday
  });

  it("skips today even when today matches a selected day (distance 0 becomes 7)", () => {
    // Today = Sunday (0), which is one of the selected days; distance 0 → 7
    // Wed distance = (3-0+7)%7 = 3, so nearest is Wednesday
    const sunday = day("2026-07-26"); // 2026-07-26 is a Sunday
    const result = calculateNextDeliveryDate(0, "weekly", sunday, [0, 3]);
    expect(dow(result)).toBe(3); // Wednesday, not today's Sunday
  });

  it("single selected day always lands on that weekday next week when today matches", () => {
    // Today = Wednesday (3), single selected = Wed; distance 0 → 7
    const wednesday = day("2026-07-29"); // 2026-07-29 is a Wednesday
    const result = calculateNextDeliveryDate(3, "weekly", wednesday, [3]);
    const diff = Math.round(
      (result.getTime() - wednesday.getTime()) / 86_400_000,
    );
    expect(diff).toBe(7);
  });

  it("picks nearest when two days are equidistant (first in array wins)", () => {
    // Today = Tuesday (2); Sun=(0-2+7)%7=5, Wed=(3-2+7)%7=1 → Wed wins
    const tuesday = day("2026-07-28");
    const result = calculateNextDeliveryDate(0, "weekly", tuesday, [0, 3]);
    expect(dow(result)).toBe(3); // Wednesday is closer
  });
});

describe("addFrequencyDays — SUB-MULTI-15 recurring cadence", () => {
  it("weekly single-day steps exactly 7 days forward", () => {
    const sunday = day("2026-07-26");
    const next = addFrequencyDays(sunday, "weekly", [0]);
    const diff = Math.round((next.getTime() - sunday.getTime()) / 86_400_000);
    expect(diff).toBe(7);
  });

  it("weekly multi-day steps to the next selected weekday, not a fixed 7-day jump", () => {
    // From Sunday (0) with days [0, 3]: next is Wednesday (+3), not next Sunday (+7)
    const sunday = day("2026-07-26");
    const next = addFrequencyDays(sunday, "weekly", [0, 3]);
    expect(dow(next)).toBe(3); // Wednesday
  });

  it("weekly multi-day from Wednesday steps to next Sunday", () => {
    // From Wednesday (3) with days [0, 3]: Sun distance = (0-3+7)%7=4, Wed = 0→7
    // nearest = Sunday (+4)
    const wednesday = day("2026-07-29");
    const next = addFrequencyDays(wednesday, "weekly", [0, 3]);
    expect(dow(next)).toBe(0); // Sunday
  });

  it("every_two_weeks steps exactly 14 days regardless of preferred days", () => {
    const start = day("2026-07-26");
    const next = addFrequencyDays(start, "every_two_weeks", [0]);
    const diff = Math.round((next.getTime() - start.getTime()) / 86_400_000);
    expect(diff).toBe(14);
  });

  it("monthly steps exactly 30 days", () => {
    const start = day("2026-07-01");
    const next = addFrequencyDays(start, "monthly", [0]);
    const diff = Math.round((next.getTime() - start.getTime()) / 86_400_000);
    expect(diff).toBe(30);
  });

  it("generates a continuous weekly multi-day cadence over a full week", () => {
    // Starting Sunday; days [0, 3]; expected sequence: Sun → Wed → Sun → Wed …
    const expectedDays = [3, 0, 3, 0]; // Wed, Sun, Wed, Sun
    let current = day("2026-07-26"); // Sunday
    for (const expected of expectedDays) {
      current = addFrequencyDays(current, "weekly", [0, 3]);
      expect(dow(current)).toBe(expected);
    }
  });
});
