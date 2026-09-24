// Canonical micronutrient vocabulary shared by meal estimation, the
// supplement catalog, and the web dashboard's %DV panels
// (PLAN-nutrition-upgrade.md Phase 2a). Units live in the key names
// (e.g. `_mg`, `_ug`) so a bare number is always unambiguous without a
// companion unit field riding along in every stored profile.
//
// Rendered into the AI prompt via `z.toJSONSchema` (prompts.ts formatToolBlock)
// — `z.partialRecord` collapses all 28 keys into one compact
// `propertyNames.enum` schema instead of 28 separate optional properties.

import { z } from "zod";

export const NUTRIENT_KEYS = [
  "fiber_g",
  "sugar_g",
  "saturated_fat_g",
  "monounsaturated_fat_g",
  "polyunsaturated_fat_g",
  "trans_fat_g",
  "omega3_mg",
  "cholesterol_mg",
  "sodium_mg",
  "potassium_mg",
  "calcium_mg",
  "iron_mg",
  "magnesium_mg",
  "zinc_mg",
  "selenium_ug",
  "iodine_ug",
  "choline_mg",
  "vitamin_a_ug",
  "vitamin_c_mg",
  "vitamin_d_ug",
  "vitamin_e_mg",
  "vitamin_k_ug",
  "thiamin_b1_mg",
  "riboflavin_b2_mg",
  "niacin_b3_mg",
  "vitamin_b6_mg",
  "folate_ug",
  "vitamin_b12_ug",
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export const nutrientProfileSchema = z.partialRecord(
  z.enum(NUTRIENT_KEYS),
  z.number().nonnegative(),
);
export type NutrientProfile = z.infer<typeof nutrientProfileSchema>;

export type NutrientGroup = "carbs" | "fats" | "minerals" | "vitamins";

export interface NutrientMetaEntry {
  label: string;
  unit: string;
  /** NIH/FDA adult daily value, or null when there's no standard DV (e.g.
   * unsaturated fat breakdowns — "healthy fats" have no ceiling to compare
   * against). */
  dv: number | null;
  group: NutrientGroup;
  /** True for nutrients you want LESS of — the web panel only turns a bar
   * red past 100% DV for these (sugar/sodium/etc); everything else is a
   * "more is fine" nutrient where 200% isn't a problem. */
  limit?: boolean;
}

/** Fixed NIH/FDA adult daily values (PLAN-nutrition-upgrade.md: "Targets are
 * fixed NIH/FDA adult daily values shown as %DV — constants in code, no
 * targets UI"). Source: FDA's 2020 adult/child(4+) Daily Value reference. */
export const NUTRIENT_META: Record<NutrientKey, NutrientMetaEntry> = {
  fiber_g: { label: "Fiber", unit: "g", dv: 28, group: "carbs" },
  sugar_g: { label: "Sugar", unit: "g", dv: 50, group: "carbs", limit: true },
  saturated_fat_g: { label: "Saturated fat", unit: "g", dv: 20, group: "fats", limit: true },
  monounsaturated_fat_g: { label: "Monounsaturated fat", unit: "g", dv: null, group: "fats" },
  polyunsaturated_fat_g: { label: "Polyunsaturated fat", unit: "g", dv: null, group: "fats" },
  trans_fat_g: { label: "Trans fat", unit: "g", dv: null, group: "fats", limit: true },
  omega3_mg: { label: "Omega-3", unit: "mg", dv: 1600, group: "fats" },
  cholesterol_mg: { label: "Cholesterol", unit: "mg", dv: 300, group: "fats", limit: true },
  sodium_mg: { label: "Sodium", unit: "mg", dv: 2300, group: "minerals", limit: true },
  potassium_mg: { label: "Potassium", unit: "mg", dv: 4700, group: "minerals" },
  calcium_mg: { label: "Calcium", unit: "mg", dv: 1300, group: "minerals" },
  iron_mg: { label: "Iron", unit: "mg", dv: 18, group: "minerals" },
  magnesium_mg: { label: "Magnesium", unit: "mg", dv: 420, group: "minerals" },
  zinc_mg: { label: "Zinc", unit: "mg", dv: 11, group: "minerals" },
  selenium_ug: { label: "Selenium", unit: "µg", dv: 55, group: "minerals" },
  iodine_ug: { label: "Iodine", unit: "µg", dv: 150, group: "minerals" },
  choline_mg: { label: "Choline", unit: "mg", dv: 550, group: "minerals" },
  vitamin_a_ug: { label: "Vitamin A", unit: "µg", dv: 900, group: "vitamins" },
  vitamin_c_mg: { label: "Vitamin C", unit: "mg", dv: 90, group: "vitamins" },
  vitamin_d_ug: { label: "Vitamin D", unit: "µg", dv: 20, group: "vitamins" },
  vitamin_e_mg: { label: "Vitamin E", unit: "mg", dv: 15, group: "vitamins" },
  vitamin_k_ug: { label: "Vitamin K", unit: "µg", dv: 120, group: "vitamins" },
  thiamin_b1_mg: { label: "Thiamin (B1)", unit: "mg", dv: 1.2, group: "vitamins" },
  riboflavin_b2_mg: { label: "Riboflavin (B2)", unit: "mg", dv: 1.3, group: "vitamins" },
  niacin_b3_mg: { label: "Niacin (B3)", unit: "mg", dv: 16, group: "vitamins" },
  vitamin_b6_mg: { label: "Vitamin B6", unit: "mg", dv: 1.7, group: "vitamins" },
  folate_ug: { label: "Folate", unit: "µg", dv: 400, group: "vitamins" },
  vitamin_b12_ug: { label: "Vitamin B12", unit: "µg", dv: 2.4, group: "vitamins" },
};

/** Sums two (partial) nutrient profiles key-by-key — used to roll meal and
 * supplement nutrients into one daily total. */
export function addNutrientProfiles(a: NutrientProfile, b: NutrientProfile): NutrientProfile {
  const result: NutrientProfile = { ...a };
  for (const key of NUTRIENT_KEYS) {
    const bv = b[key];
    if (bv === undefined) continue;
    result[key] = (result[key] ?? 0) + bv;
  }
  return result;
}

/** Scales every present key in a profile by `factor` — e.g. a supplement's
 * per-serving nutrients times `servings` taken. */
export function scaleNutrientProfile(profile: NutrientProfile, factor: number): NutrientProfile {
  const result: NutrientProfile = {};
  for (const key of NUTRIENT_KEYS) {
    const v = profile[key];
    if (v === undefined) continue;
    result[key] = v * factor;
  }
  return result;
}
