import { describe, expect, it } from "vitest";
import { ageOn, missingGoalFields, presetTargets } from "./goals.js";

const now = new Date(2026, 8, 23);
const profile = {
  weight_kg: 81.6, // ~180 lb
  height_cm: 180,
  birth_date: "2000-01-15",
  sex: "male" as const,
  activity_level: "moderate" as const,
};

describe("ageOn", () => {
  it("counts birthdays that haven't happened yet this year", () => {
    expect(ageOn("2000-12-01", now)).toBe(25);
    expect(ageOn("2000-09-23", now)).toBe(26);
  });
});

describe("presetTargets", () => {
  it("orders calories lose < maintain < build", () => {
    const lose = presetTargets(profile, "lose_fat", { now });
    const keep = presetTargets(profile, "maintain", { now });
    const build = presetTargets(profile, "build_muscle", { now });
    expect(lose.calories).toBeLessThan(keep.calories);
    expect(keep.calories).toBeLessThan(build.calories);
  });

  it("uses 0.73 g/lb protein for build_muscle", () => {
    const t = presetTargets(profile, "build_muscle", { now });
    expect(t.protein_g_per_lb).toBe(0.73);
    expect(t.protein_g).toBe(131); // 180 lb × 0.73
  });

  it("macros add back up to roughly the calorie target", () => {
    const t = presetTargets(profile, "lose_fat", { now });
    const kcal = t.protein_g * 4 + t.carbs_g * 4 + t.fat_g * 9;
    expect(Math.abs(kcal - t.calories)).toBeLessThan(10);
  });

  it("clamps the protein override to the allowed range", () => {
    expect(presetTargets(profile, "maintain", { now, proteinPerLb: 3 }).protein_g_per_lb).toBe(1.2);
  });

  it("refuses an incomplete profile", () => {
    expect(missingGoalFields({ ...profile, sex: null })).toEqual(["sex"]);
    expect(() => presetTargets({ ...profile, weight_kg: null }, "maintain")).toThrow(/weight/);
  });
});
