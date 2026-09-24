import { describe, expect, it } from "vitest";
import { itemWarnings } from "./validate";

const base = { name: "black beans", grams: 172, carbs_g: 0, fat_g: 0, userStated: true };

describe("itemWarnings", () => {
  it("flags the '1 cup black beans, 50 cals, 200 g protein' case twice", () => {
    const w = itemWarnings({ ...base, calories: 50, protein_g: 200 });
    expect(w[0]).toMatch(/800 kcal on its own/);
    expect(w[1]).toMatch(/can't fit in ~172 g/);
  });

  it("accepts a plausible item", () => {
    expect(itemWarnings({ ...base, calories: 227, protein_g: 15, carbs_g: 41, fat_g: 1 })).toEqual(
      [],
    );
  });

  it("flags macros that don't add up", () => {
    expect(
      itemWarnings({
        ...base,
        grams: null,
        calories: 900,
        protein_g: 20,
        carbs_g: 30,
        fat_g: 5,
      })[0],
    ).toMatch(/add up to ~245 kcal/);
  });
});

import { implausible } from "./resolve";

describe("implausible", () => {
  it("rejects a match 4x the model's estimate (condensed milk for a cup of milk)", () => {
    expect(implausible(540, 122)).toBe(true);
    expect(implausible(130, 122)).toBe(false);
    expect(implausible(900, 20)).toBe(false); // estimate too small to judge
    // 6 oz chicken: USDA 280 kcal vs an inflated 600 kcal guess — trust USDA.
    expect(implausible(280, 600)).toBe(false);
  });
});
