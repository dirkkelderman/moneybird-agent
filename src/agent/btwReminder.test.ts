import "../test/setup.js";
import { describe, it, expect } from "vitest";
import { getPreviousQuarter, getBTWFilingDeadline } from "./btwReminder.js";

describe("getPreviousQuarter", () => {
  it("returns Q4 of the previous year in January", () => {
    expect(getPreviousQuarter(new Date("2026-01-01T08:00:00Z"))).toEqual({ year: 2025, quarter: 4 });
  });

  it("returns the prior quarter within the same year", () => {
    expect(getPreviousQuarter(new Date("2026-04-01T08:00:00Z"))).toEqual({ year: 2026, quarter: 1 });
    expect(getPreviousQuarter(new Date("2026-07-15T08:00:00Z"))).toEqual({ year: 2026, quarter: 2 });
    expect(getPreviousQuarter(new Date("2026-10-01T08:00:00Z"))).toEqual({ year: 2026, quarter: 3 });
  });

  it("uses UTC months, not local time", () => {
    // 23:30 UTC on Mar 31 is still Q1 → previous quarter Q4 of prior year
    expect(getPreviousQuarter(new Date("2026-03-31T23:30:00Z"))).toEqual({ year: 2025, quarter: 4 });
  });
});

describe("getBTWFilingDeadline", () => {
  it("is the last day of the month after the quarter", () => {
    expect(getBTWFilingDeadline(2026, 1)).toBe("2026-04-30");
    expect(getBTWFilingDeadline(2026, 2)).toBe("2026-07-31");
    expect(getBTWFilingDeadline(2026, 3)).toBe("2026-10-31");
  });

  it("rolls over the year for Q4", () => {
    expect(getBTWFilingDeadline(2025, 4)).toBe("2026-01-31");
  });
});
