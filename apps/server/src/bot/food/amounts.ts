// Pure quantity math: how much of a reference food (a saved food, a past
// item, a database entry) did the user actually eat?

import { type Macros, scaleMacros } from "../../foods/types";

const GRAMS_PER: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  gr: 1,
  kg: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
  ml: 1,
  milliliter: 1,
  milliliters: 1,
};

const SERVING_UNITS = new Set(["serving", "servings", "portion", "portions", "scoop", "scoops"]);

export interface Amount {
  /** Grams eaten, when we can tell. */
  grams: number | null;
  /** Number of reference servings eaten, when the user counted servings. */
  servings: number | null;
}

export function amountOf(item: {
  quantity: number | null;
  unit: string | null;
  grams_estimate: number | null;
}): Amount {
  const unit = item.unit?.trim().toLowerCase() ?? null;
  const q = item.quantity;
  if (unit && GRAMS_PER[unit] != null && q != null) {
    return { grams: q * (GRAMS_PER[unit] as number), servings: null };
  }
  if (unit == null || SERVING_UNITS.has(unit)) {
    return { grams: null, servings: q ?? 1 };
  }
  // cups, tbsp, slices, pieces...: rely on the model's gram estimate.
  return { grams: item.grams_estimate, servings: null };
}

export function isServingUnit(unit: string | null): boolean {
  return unit != null && SERVING_UNITS.has(unit.trim().toLowerCase());
}

export interface Reference extends Macros {
  serving_grams: number | null;
  per100g?: Macros | null;
}

/** Macros for `amount` of `ref`. Returns the factor used so callers can
 * record grams/quantity consistently. */
export function macrosFor(
  ref: Reference,
  amount: Amount,
): { macros: Macros; grams: number | null } {
  if (amount.servings != null) {
    return {
      macros: scaleMacros(ref, amount.servings),
      grams: ref.serving_grams != null ? Math.round(ref.serving_grams * amount.servings) : null,
    };
  }
  if (amount.grams != null) {
    if (ref.per100g)
      return { macros: scaleMacros(ref.per100g, amount.grams / 100), grams: amount.grams };
    if (ref.serving_grams) {
      return { macros: scaleMacros(ref, amount.grams / ref.serving_grams), grams: amount.grams };
    }
  }
  return { macros: scaleMacros(ref, 1), grams: ref.serving_grams };
}
