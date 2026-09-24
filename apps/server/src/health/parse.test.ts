import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/hae-v2-daily.json";
import { parseHealthPayload } from "./parse";

describe("parseHealthPayload", () => {
  const parsed = parseHealthPayload(fixture);

  it("maps daily metrics, converting kJ to kcal", () => {
    expect(parsed.daily).toEqual(
      expect.arrayContaining([
        { date: "2026-09-22", metric: "steps", value: 9412 },
        { date: "2026-09-23", metric: "steps", value: 3121 },
        { date: "2026-09-22", metric: "active_kcal", value: 600 },
        { date: "2026-09-22", metric: "basal_kcal", value: 1788.2 },
      ]),
    );
  });

  it("merges weight (lb → kg) and body fat (fraction → %) by day", () => {
    expect(parsed.weights).toEqual([{ date: "2026-09-22", weight_kg: 82.19, fat_percent: 16.4 }]);
  });

  it("ignores dietary energy so food isn't double-counted", () => {
    expect(parsed.ignored).toContain("dietary_energy");
  });

  it("survives junk", () => {
    expect(parseHealthPayload(null)).toEqual({ daily: [], weights: [], ignored: [] });
    expect(
      parseHealthPayload({
        data: { metrics: [{ name: "step_count", data: [{ date: "bad", qty: 1 }] }] },
      }).daily,
    ).toEqual([]);
  });
});
