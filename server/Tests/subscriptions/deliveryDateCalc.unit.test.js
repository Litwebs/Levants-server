"use strict";

const {
  calculateNextDeliveryDate,
  addFrequencyDays,
} = require("../../services/customerPortal/customerSubscriptions.service");
const {
  formatDateKeyInTimeZone,
  weekdayInTimeZone,
  zonedDateTimeToUtc,
} = require("../../utils/subscriptionCutoff.util");

const BUSINESS_TZ = "Europe/London";
const dow = (value) => weekdayInTimeZone(value, BUSINESS_TZ);

const day = (iso) => {
  const [year, month, date] = iso.split("-").map(Number);
  return zonedDateTimeToUtc(
    { year, month, day: date, hour: 0, minute: 0, second: 0 },
    BUSINESS_TZ,
  );
};

const localDateParts = (value) =>
  formatDateKeyInTimeZone(value, BUSINESS_TZ).split("-").map(Number);

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
    // Wed distance = (3-0+7)%7=3, so nearest is Wednesday
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

  it("monthly advances by one calendar month and preserves the selected weekday occurrence", () => {
    const firstWednesday = day("2026-07-01");
    const august = addFrequencyDays(firstWednesday, "monthly", [3]);
    const september = addFrequencyDays(august, "monthly", [3]);

    expect(dow(august)).toBe(3);
    expect(dow(september)).toBe(3);
    expect(localDateParts(august)).toEqual([2026, 8, 5]);
    expect(localDateParts(september)).toEqual([2026, 9, 2]);
  });

  it("monthly last-week cadence stays on the last selected weekday through February", () => {
    const lastSunday = day("2027-01-31");
    const february = addFrequencyDays(lastSunday, "monthly", [0]);
    const march = addFrequencyDays(february, "monthly", [0]);

    expect(localDateParts(february)).toEqual([2027, 2, 28]);
    expect(localDateParts(march)).toEqual([2027, 3, 28]);
    expect(dow(february)).toBe(0);
    expect(dow(march)).toBe(0);
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
  it("steps by business calendar days across the spring DST change", () => {
    const start = day("2026-03-29");
    const next = addFrequencyDays(start, "weekly", [0]);

    expect(formatDateKeyInTimeZone(next, BUSINESS_TZ)).toBe("2026-04-05");
    expect(dow(next)).toBe(0);
    // The week contains the spring clock change, so it is 167 elapsed hours,
    // not a hard-coded 168-hour duration.
    expect((next.getTime() - start.getTime()) / 3_600_000).toBe(167);
  });

});
