// USDA FoodData Central search. Free API key (data.gov); DEMO_KEY works for
// light local use. Foundation / SR Legacy values are per 100 g; Branded
// values are per 100 g too, with the label serving in servingSize.

import { env } from "../env";
import { type FoodCandidate, type Macros, scaleMacros } from "./types";

interface FdcNutrient {
  nutrientId?: number;
  nutrientNumber?: string;
  unitName?: string;
  value?: number;
}

interface FdcFood {
  fdcId: number;
  description: string;
  dataType?: string;
  brandOwner?: string;
  brandName?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: FdcNutrient[];
}

const NUTRIENT = {
  energyKcal: [1008, 2047, 2048],
  protein: [1003],
  fat: [1004],
  carbs: [1005],
  fiber: [1079],
};

function pick(nutrients: FdcNutrient[], ids: number[]): number {
  for (const id of ids) {
    const n = nutrients.find((x) => x.nutrientId === id && (id !== 1008 || x.unitName !== "kJ"));
    if (n?.value != null) return n.value;
  }
  return 0;
}

function titleCase(s: string): string {
  // FDC descriptions are often SHOUTING ("BLACK BEANS, CANNED").
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s;
}

export function fdcToCandidate(food: FdcFood): FoodCandidate {
  const n = food.foodNutrients ?? [];
  const protein_g = pick(n, NUTRIENT.protein);
  const carbs_g = pick(n, NUTRIENT.carbs);
  const fat_g = pick(n, NUTRIENT.fat);
  // Some Foundation foods omit energy in search results; derive it (Atwater).
  const calories =
    pick(n, NUTRIENT.energyKcal) || Math.round((protein_g * 4 + carbs_g * 4 + fat_g * 9) * 10) / 10;
  const per100g: Macros = { calories, protein_g, carbs_g, fat_g, fiber_g: pick(n, NUTRIENT.fiber) };
  const unit = food.servingSizeUnit?.toLowerCase();
  const servingGrams =
    food.servingSize && (unit === "g" || unit === "grm" || unit === "ml" || unit === "mlt")
      ? food.servingSize
      : null;
  const per = servingGrams ? scaleMacros(per100g, servingGrams / 100) : per100g;
  const household = food.householdServingFullText?.trim();
  const servingDesc = servingGrams
    ? household
      ? /\d\s*g\b|gram/i.test(household)
        ? household
        : `${household} (${servingGrams} g)`
      : `${servingGrams} g`
    : "100 g";

  return {
    id: `usda:${food.fdcId}`,
    source: "usda",
    name: titleCase(food.description),
    brand: food.brandName ?? food.brandOwner ?? null,
    serving_desc: servingDesc,
    serving_grams: servingGrams ?? 100,
    per100g,
    ...per,
  };
}

export async function searchUsda(
  query: string,
  opts: { branded?: boolean; survey?: boolean; limit?: number; signal?: AbortSignal } = {},
): Promise<FoodCandidate[]> {
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", env.USDA_FDC_API_KEY);
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", String(opts.limit ?? 8));
  // Generic foods: every word must match, so "black beans" doesn't lead
  // with "black bean salad" style partial matches.
  if (!opts.branded) url.searchParams.set("requireAllWords", "true");
  url.searchParams.set(
    "dataType",
    opts.branded ? "Branded" : opts.survey ? "Survey (FNDDS)" : "Foundation,SR Legacy",
  );
  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok) throw new Error(`USDA search failed (${res.status})`);
  const body = (await res.json()) as { foods?: FdcFood[] };
  return (body.foods ?? []).map(fdcToCandidate).filter((c) => c.calories > 0 || c.protein_g > 0);
}
