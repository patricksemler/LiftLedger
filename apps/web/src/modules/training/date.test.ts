// Characterization tests (REFACTOR_PLAN.md Phase 0): lock in current
// behavior of gym/date.ts before Phase 6/7/8 touch anything nearby.
import { describe, expect, it } from "vitest";
import { chartWeekLabel, weekRangeLabel, weekStartLocalDate } from "./date";

describe("weekStartLocalDate", () => {
  it("returns the same Monday for any day within that week", () => {
    // 2026-07-17 is a Friday.
    expect(weekStartLocalDate(new Date(2026, 6, 17))).toBe("2026-07-13");
    expect(weekStartLocalDate(new Date(2026, 6, 13))).toBe("2026-07-13");
    expect(weekStartLocalDate(new Date(2026, 6, 19))).toBe("2026-07-13");
  });
});

describe("chartWeekLabel", () => {
  it("formats a week-start date as a short month/day label", () => {
    expect(chartWeekLabel("2026-07-13")).toBe("Jul 13");
  });
});

describe("weekRangeLabel", () => {
  it("shows month once when the week stays within one month", () => {
    expect(weekRangeLabel("2026-07-13")).toBe("Jul 13 – 19");
  });

  it("repeats the month when the week straddles two", () => {
    expect(weekRangeLabel("2026-06-29")).toBe("Jun 29 – Jul 5");
  });
});
