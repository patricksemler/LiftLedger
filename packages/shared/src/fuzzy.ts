// Staged fuzzy name-matcher (REFACTOR_PLAN.md Phase 2 step 3) — the same
// algorithm the routines/brief/gym modules each duplicated for "fuzzy name
// match; ambiguity => return candidates so the AI can ask" (PLAN.md). Gym's
// exercise matching adds a third word-overlap ranking stage the other two
// modules don't need, so it's opt-in via `options.tokenOverlap`.

export type FuzzyMatch<T> =
  | { kind: "found"; candidate: T }
  | { kind: "ambiguous"; candidates: T[] }
  | { kind: "not_found" };

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/** Token (word) overlap ratio — a cheap trigram-ish similarity that doesn't
 * need a real n-gram library: splits both strings on whitespace and scores
 * by how many words they share relative to the larger word set. */
function tokenOverlapScore(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter(Boolean));
  const tokensB = new Set(b.split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokensA) if (tokensB.has(t)) overlap++;
  return overlap / Math.max(tokensA.size, tokensB.size);
}

export interface FuzzyMatchOptions {
  /** Adds a third "trigram-ish" word-overlap ranking stage after exact and
   * substring matching both come up empty — PLAN.md gym spec: "ILIKE +
   * trigram-ish ranking in TS". Ties (including "nobody shares any words")
   * come back ambiguous/not_found respectively. */
  tokenOverlap?: boolean;
}

/**
 * Matches a user-supplied name against a candidate list:
 * 1. An exact case-insensitive match wins outright. Multiple exact matches
 *    (shouldn't normally happen, but names aren't always unique) come back
 *    `ambiguous`.
 * 2. Otherwise, substring matches in either direction (the query inside the
 *    candidate's name, or vice versa) are tried; exactly one match wins,
 *    multiple come back `ambiguous`.
 * 3. If `options.tokenOverlap` is set and neither stage above resolved, a
 *    word-overlap score ranks all candidates and the top-scoring ones win
 *    (ties come back `ambiguous`).
 * 4. No match at any stage is `not_found`.
 */
export function fuzzyMatch<T>(
  query: string,
  candidates: T[],
  getName: (candidate: T) => string,
  options: FuzzyMatchOptions = {},
): FuzzyMatch<T> {
  const needle = normalize(query);
  if (!needle) return { kind: "not_found" };

  const exact = candidates.filter((c) => normalize(getName(c)) === needle);
  const [onlyExact] = exact;
  if (exact.length === 1 && onlyExact) return { kind: "found", candidate: onlyExact };
  if (exact.length > 1) return { kind: "ambiguous", candidates: exact };

  const substring = candidates.filter((c) => {
    const name = normalize(getName(c));
    return name.includes(needle) || needle.includes(name);
  });
  const [onlySubstring] = substring;
  if (substring.length === 1 && onlySubstring) return { kind: "found", candidate: onlySubstring };
  if (substring.length > 1) return { kind: "ambiguous", candidates: substring };

  if (!options.tokenOverlap) return { kind: "not_found" };

  const scored = candidates
    .map((c) => ({ candidate: c, score: tokenOverlapScore(needle, normalize(getName(c))) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { kind: "not_found" };

  const topScore = scored[0]?.score;
  const top = scored.filter((s) => s.score === topScore);
  const [onlyTop] = top;
  if (top.length === 1 && onlyTop) return { kind: "found", candidate: onlyTop.candidate };
  return { kind: "ambiguous", candidates: top.map((s) => s.candidate) };
}
