// Open Food Facts search — best for branded and store-brand products (e.g.
// "HEB Premium Granola") that USDA's branded set may not carry. OFF asks
// every client to send an identifying User-Agent.

import { type FoodCandidate, type Macros, scaleMacros } from "./types";

const USER_AGENT = "LiftLedger/0.1 (self-hosted nutrition tracker)";

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) ? n : 0;
};

export function offToCandidate(p: OffProduct): FoodCandidate | null {
  const n = p.nutriments ?? {};
  const kcal100 = num(n["energy-kcal_100g"]) || num(n.energy_100g) / 4.184;
  const per100g: Macros = {
    calories: Math.round(kcal100 * 10) / 10,
    protein_g: num(n.proteins_100g),
    carbs_g: num(n.carbohydrates_100g),
    fat_g: num(n.fat_100g),
    fiber_g: num(n.fiber_100g),
  };
  if (!p.product_name || (per100g.calories === 0 && per100g.protein_g === 0)) return null;
  const servingGrams = num(p.serving_quantity) || null;
  const per = servingGrams ? scaleMacros(per100g, servingGrams / 100) : per100g;
  return {
    id: `off:${p.code ?? p.product_name}`,
    source: "off",
    name: p.product_name.trim(),
    brand: p.brands?.split(",")[0]?.trim() || null,
    serving_desc: servingGrams ? (p.serving_size ?? `${servingGrams} g`) : "100 g",
    serving_grams: servingGrams ?? 100,
    per100g,
    ...per,
  };
}

export async function searchOff(
  query: string,
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<FoodCandidate[]> {
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_terms", query);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", String(opts.limit ?? 8));
  url.searchParams.set(
    "fields",
    "code,product_name,brands,serving_size,serving_quantity,nutriments",
  );
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: opts.signal });
  if (!res.ok) throw new Error(`Open Food Facts search failed (${res.status})`);
  const body = (await res.json()) as { products?: OffProduct[] };
  return (body.products ?? []).flatMap((p) => offToCandidate(p) ?? []);
}
