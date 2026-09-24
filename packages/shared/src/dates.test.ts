// Ported from apps/worker/src/modules/routines/{date,streak}.test.ts and the
// web dashboard's gym/nutrition/routines date-helper tests (REFACTOR_PLAN.md
// Phase 2 step 1) — same expectations against the now-shared implementation.
import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  formatLocalDate,
  localDateString,
  parseExplicitDate,
  parseLocalDate,
  resolveDate,
  shiftDate,
  todayLocalDate,
} from "./dates.js";

describe("localDateString", () => {
  it("returns the calendar date in the given IANA timezone", () => {
    // 2026-07-13T02:30:00Z is still 2026-07-12 in America/New_York (UTC-4 in July).
    const instant = new Date("2026-07-13T02:30:00.000Z");
    expect(localDateString(instant, "America/New_York")).toBe("2026-07-12");
    expect(localDateString(instant, "UTC")).toBe("2026-07-13");
  });

  it("handles a timezone that rolls the date forward", () => {
    // 2026-07-13T23:30:00Z is already 2026-07-14 in Asia/Tokyo (UTC+9).
    const instant = new Date("2026-07-13T23:30:00.000Z");
    expect(localDateString(instant, "Asia/Tokyo")).toBe("2026-07-14");
  });
});

describe("parseExplicitDate", () => {
  it("accepts a valid YYYY-MM-DD date", () => {
    expect(parseExplicitDate("2026-07-13")).toBe("2026-07-13");
  });

  it("rejects undefined/null/empty", () => {
    expect(parseExplicitDate(undefined)).toBeNull();
    expect(parseExplicitDate(null)).toBeNull();
    expect(parseExplicitDate("")).toBeNull();
  });

  it("rejects malformed strings and impossible calendar dates", () => {
    expect(parseExplicitDate("07/13/2026")).toBeNull();
    expect(parseExplicitDate("not-a-date")).toBeNull();
    expect(parseExplicitDate("2026-02-30")).toBeNull();
  });
});

describe("resolveDate", () => {
  it("prefers a valid explicit date over today", () => {
    const ctx = { now: new Date("2026-07-13T12:00:00.000Z"), timezone: "UTC" };
    expect(resolveDate("2026-01-01", ctx)).toBe("2026-01-01");
  });

  it("falls back to today in the given timezone when omitted or invalid", () => {
    const ctx = { now: new Date("2026-07-13T12:00:00.000Z"), timezone: "UTC" };
    expect(resolveDate(undefined, ctx)).toBe("2026-07-13");
    expect(resolveDate("garbage", ctx)).toBe("2026-07-13");
  });
});

describe("shiftDate", () => {
  it("moves a date backward by N days, crossing a month boundary", () => {
    expect(shiftDate("2026-07-01", -1)).toBe("2026-06-30");
    expect(shiftDate("2026-07-13", -6)).toBe("2026-07-07");
  });

  it("moves a date forward by N days", () => {
    expect(shiftDate("2026-07-30", 3)).toBe("2026-08-02");
  });

  it("is a no-op for a zero delta", () => {
    expect(shiftDate("2026-07-13", 0)).toBe("2026-07-13");
  });
});

describe("formatLocalDate / parseLocalDate", () => {
  it("pads month and day", () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("round-trips a date string", () => {
    expect(formatLocalDate(parseLocalDate("2026-07-17"))).toBe("2026-07-17");
  });
});

describe("todayLocalDate", () => {
  it("matches formatLocalDate(new Date())", () => {
    expect(todayLocalDate()).toBe(formatLocalDate(new Date()));
  });
});

describe("addLocalDays", () => {
  it("adds and subtracts across month boundaries", () => {
    expect(addLocalDays("2026-07-30", 3)).toBe("2026-08-02");
    expect(addLocalDays("2026-08-01", -2)).toBe("2026-07-30");
  });
});
