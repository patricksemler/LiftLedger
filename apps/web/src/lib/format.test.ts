import { describe, expect, it, vi } from "vitest";
import { formatAxisDate, relativeTime } from "./format";

describe("relativeTime", () => {
  it("reports 'just now' under a minute", () => {
    const now = new Date("2026-07-17T12:00:00.000Z");
    vi.setSystemTime(now);
    expect(relativeTime(new Date(now.getTime() - 10_000).toISOString())).toBe("just now");
    vi.useRealTimers();
  });

  it("reports minutes, hours, and days", () => {
    const now = new Date("2026-07-17T12:00:00.000Z");
    vi.setSystemTime(now);
    expect(relativeTime(new Date(now.getTime() - 5 * 60_000).toISOString())).toBe("5m ago");
    expect(relativeTime(new Date(now.getTime() - 3 * 3_600_000).toISOString())).toBe("3h ago");
    expect(relativeTime(new Date(now.getTime() - 2 * 86_400_000).toISOString())).toBe("2d ago");
    vi.useRealTimers();
  });
});

describe("formatAxisDate", () => {
  it("formats a millisecond timestamp as a short month/day label", () => {
    expect(formatAxisDate(new Date(2026, 6, 13).getTime())).toBe("Jul 13");
  });
});

describe("relativeTime (future)", () => {
  it("describes future times instead of 'just now'", () => {
    expect(relativeTime(new Date(Date.now() + 10 * 60_000).toISOString())).toBe("in 10 min");
  });
});
