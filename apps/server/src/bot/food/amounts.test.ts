import { describe, expect, it } from "vitest";
import { amountOf, macrosFor } from "./amounts";

const granola = {
  calories: 240,
  protein_g: 5,
  carbs_g: 36,
  fat_g: 9,
  fiber_g: 3,
  serving_grams: 55,
  per100g: null,
};

describe("amountOf", () => {
  it("counts servings for serving units and bare numbers", () => {
    expect(amountOf({ quantity: 3, unit: "servings", grams_estimate: 165 })).toEqual({
      grams: null,
      servings: 3,
    });
    expect(amountOf({ quantity: 2, unit: null, grams_estimate: null })).toEqual({
      grams: null,
      servings: 2,
    });
  });

  it("converts weight units", () => {
    expect(amountOf({ quantity: 4, unit: "oz", grams_estimate: null }).grams).toBeCloseTo(113.4, 1);
  });

  it("falls back to the gram estimate for volume units", () => {
    expect(amountOf({ quantity: 1, unit: "cup", grams_estimate: 172 })).toEqual({
      grams: 172,
      servings: null,
    });
  });
});

describe("macrosFor", () => {
  it("multiplies servings — '3 servings of heb premium granola'", () => {
    expect(macrosFor(granola, { grams: null, servings: 3 })).toEqual({
      macros: { calories: 720, protein_g: 15, carbs_g: 108, fat_g: 27, fiber_g: 9 },
      grams: 165,
    });
  });

  it("scales grams by per-100g when known, else by serving grams", () => {
    const beans = {
      ...granola,
      serving_grams: 100,
      per100g: { calories: 91, protein_g: 6, carbs_g: 16.6, fat_g: 0.3, fiber_g: 6.9 },
    };
    expect(macrosFor(beans, { grams: 172, servings: null }).macros.calories).toBe(156.5);
    expect(macrosFor(granola, { grams: 110, servings: null }).macros.calories).toBe(480);
  });
});
