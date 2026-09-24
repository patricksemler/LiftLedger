import { describe, expect, it } from "vitest";
import {
  NUTRIENT_KEYS,
  NUTRIENT_META,
  addNutrientProfiles,
  nutrientProfileSchema,
  scaleNutrientProfile,
} from "./nutrients.js";

describe("NUTRIENT_KEYS / NUTRIENT_META parity", () => {
  it("has a META entry for every key and no extras", () => {
    const keySet = new Set(NUTRIENT_KEYS);
    const metaKeys = Object.keys(NUTRIENT_META);
    expect(metaKeys).toHaveLength(NUTRIENT_KEYS.length);
    for (const key of metaKeys)
      expect(keySet.has(key as (typeof NUTRIENT_KEYS)[number])).toBe(true);
  });

  it("every dv is either positive or null", () => {
    for (const key of NUTRIENT_KEYS) {
      const dv = NUTRIENT_META[key].dv;
      expect(dv === null || dv > 0).toBe(true);
    }
  });

  it("every entry has a non-empty label and unit", () => {
    for (const key of NUTRIENT_KEYS) {
      expect(NUTRIENT_META[key].label.length).toBeGreaterThan(0);
      expect(NUTRIENT_META[key].unit.length).toBeGreaterThan(0);
    }
  });
});

describe("nutrientProfileSchema", () => {
  it("accepts a partial profile of known keys", () => {
    const result = nutrientProfileSchema.safeParse({ fiber_g: 8, sodium_mg: 450 });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown key", () => {
    const result = nutrientProfileSchema.safeParse({ not_a_nutrient: 5 });
    expect(result.success).toBe(false);
  });

  it("rejects a negative value", () => {
    const result = nutrientProfileSchema.safeParse({ fiber_g: -1 });
    expect(result.success).toBe(false);
  });

  it("accepts an empty object", () => {
    expect(nutrientProfileSchema.safeParse({}).success).toBe(true);
  });
});

describe("addNutrientProfiles", () => {
  it("sums overlapping keys and keeps non-overlapping ones", () => {
    const result = addNutrientProfiles(
      { fiber_g: 5, sodium_mg: 200 },
      { fiber_g: 3, vitamin_c_mg: 20 },
    );
    expect(result).toEqual({ fiber_g: 8, sodium_mg: 200, vitamin_c_mg: 20 });
  });

  it("returns the left side unchanged when the right side is empty", () => {
    expect(addNutrientProfiles({ fiber_g: 5 }, {})).toEqual({ fiber_g: 5 });
  });
});

describe("scaleNutrientProfile", () => {
  it("multiplies every present key by the factor", () => {
    expect(scaleNutrientProfile({ fiber_g: 4, sodium_mg: 100 }, 2)).toEqual({
      fiber_g: 8,
      sodium_mg: 200,
    });
  });

  it("returns an empty profile for an empty input", () => {
    expect(scaleNutrientProfile({}, 3)).toEqual({});
  });
});
