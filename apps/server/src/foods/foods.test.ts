import { describe, expect, it } from "vitest";
import { offToCandidate } from "./off";
import { fdcToCandidate } from "./usda";

describe("fdcToCandidate", () => {
  it("scales a branded label serving from per-100g values", () => {
    const c = fdcToCandidate({
      fdcId: 1,
      description: "PREMIUM GRANOLA",
      dataType: "Branded",
      brandOwner: "H-E-B",
      servingSize: 55,
      servingSizeUnit: "g",
      householdServingFullText: "2/3 cup",
      foodNutrients: [
        { nutrientId: 1008, unitName: "KCAL", value: 436 },
        { nutrientId: 1003, value: 10.9 },
        { nutrientId: 1004, value: 16.4 },
        { nutrientId: 1005, value: 65.5 },
      ],
    });
    expect(c).toMatchObject({
      id: "usda:1",
      name: "Premium Granola",
      brand: "H-E-B",
      serving_desc: "2/3 cup (55 g)",
      serving_grams: 55,
      calories: 239.8,
      protein_g: 6,
    });
  });

  it("falls back to 100 g for generic foods and ignores kJ energy", () => {
    const c = fdcToCandidate({
      fdcId: 2,
      description: "Beans, black, canned",
      foodNutrients: [
        { nutrientId: 1008, unitName: "kJ", value: 380 },
        { nutrientId: 2047, unitName: "KCAL", value: 91 },
        { nutrientId: 1003, value: 6 },
      ],
    });
    expect(c).toMatchObject({ serving_desc: "100 g", calories: 91, protein_g: 6 });
  });
});

describe("offToCandidate", () => {
  it("uses serving_quantity grams when present", () => {
    const c = offToCandidate({
      code: "123",
      product_name: "Premium Granola",
      brands: "H-E-B, HEB",
      serving_size: "2/3 cup (55 g)",
      serving_quantity: "55",
      nutriments: {
        "energy-kcal_100g": 440,
        proteins_100g: 10,
        carbohydrates_100g: 64,
        fat_100g: 16,
      },
    });
    expect(c).toMatchObject({ brand: "H-E-B", calories: 242, protein_g: 5.5, serving_grams: 55 });
  });

  it("drops products without nutrition", () => {
    expect(offToCandidate({ product_name: "Mystery", nutriments: {} })).toBeNull();
  });
});
