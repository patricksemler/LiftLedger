import { searchOff } from "./off";
import type { FoodCandidate } from "./types";
import { searchUsda } from "./usda";

const TIMEOUT_MS = 7000;
const CACHE_TTL_MS = 6 * 3600_000;
const CACHE_MAX = 500;

// USDA's DEMO_KEY allows ~30 requests/hour, and food names repeat a lot, so
// results are cached in memory per (query, branded) for a few hours.
const cache = new Map<string, { at: number; results: FoodCandidate[] }>();

async function settle<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return await p;
  } catch {
    return [];
  }
}

/** Search every database in parallel, tolerate individual failures, and
 * interleave results so one slow/empty source never hides the other. With
 * `branded`, prefer branded datasets (USDA Branded + OFF). */
export async function searchFoods(
  query: string,
  opts: { branded?: boolean; limit?: number } = {},
): Promise<FoodCandidate[]> {
  const limit = opts.limit ?? 10;
  const key = `${opts.branded ? "b" : "g"}|${query.trim().toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.results.slice(0, limit);

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const none = Promise.resolve([] as FoodCandidate[]);
  const [reference, survey, brandedUsda, off] = await Promise.all([
    opts.branded ? none : settle(searchUsda(query, { limit: 5, signal })),
    opts.branded ? none : settle(searchUsda(query, { survey: true, limit: 5, signal })),
    settle(searchUsda(query, { branded: true, limit: 6, signal })),
    settle(searchOff(query, { limit: 6, signal })),
  ]);
  const lists = opts.branded ? [brandedUsda, off] : [reference, survey, brandedUsda, off];
  const out: FoodCandidate[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < 20 && lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      const c = list[i];
      if (!c) continue;
      const key = `${c.name.toLowerCase()}|${c.brand?.toLowerCase() ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  }
  // Don't cache a total failure (e.g. a timeout) — retry next time.
  if (out.length > 0) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), results: out });
  }
  return out.slice(0, limit);
}
