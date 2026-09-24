export interface Macros {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

/** One food from a nutrition database, with macros per serving and (when
 * known) per 100 g so callers can scale to any gram weight. */
export interface FoodCandidate extends Macros {
  id: string;
  source: "usda" | "off";
  name: string;
  brand: string | null;
  /** Human description of one serving, e.g. "2/3 cup (55 g)" or "100 g". */
  serving_desc: string;
  serving_grams: number | null;
  per100g: Macros | null;
}

export const ZERO: Macros = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };

export function scaleMacros(m: Macros, factor: number): Macros {
  const r = (n: number) => Math.round(n * factor * 10) / 10;
  return {
    calories: r(m.calories),
    protein_g: r(m.protein_g),
    carbs_g: r(m.carbs_g),
    fat_g: r(m.fat_g),
    fiber_g: r(m.fiber_g),
  };
}
