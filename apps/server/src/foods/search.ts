import { searchOff } from "./off";
import type { FoodCandidate } from "./types";
import { searchUsda } from "./usda";

const TIMEOUT_MS = 7000;

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
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const limit = opts.limit ?? 10;
  const [generic, brandedUsda, off] = await Promise.all([
    opts.branded ? Promise.resolve([]) : settle(searchUsda(query, { limit: 6, signal })),
    settle(searchUsda(query, { branded: true, limit: 6, signal })),
    settle(searchOff(query, { limit: 6, signal })),
  ]);
  const lists = opts.branded ? [brandedUsda, off] : [generic, brandedUsda, off];
  const out: FoodCandidate[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      const c = list[i];
      if (!c) continue;
      const key = `${c.name.toLowerCase()}|${c.brand?.toLowerCase() ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  }
  return out.slice(0, limit);
}
