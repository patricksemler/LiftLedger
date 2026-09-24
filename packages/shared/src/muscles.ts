// Muscle-group vocabulary: the bridge between how a person asks ("how are my
// biceps doing?", "compare my arms", "push day progress") and the
// `primary_muscle_group` / `secondary_muscle_groups` values Hevy actually
// stores on `gym_exercise_templates`.
//
// Nothing else in the codebase can answer a muscle-scoped question without
// this: the raw Hevy taxonomy has no "arms", no "back", no "upper body", and
// spells things `lower_back`/`quadriceps`/`abdominals` — so a tool taking a
// free-text muscle param needs one place that maps user words to a set of
// canonical groups. Kept alongside `MOVEMENT_PATTERNS` in metrics.ts (which
// is a *different* reduction — four training patterns for the progression
// chart's lines, not a name-resolution vocabulary), and deliberately not
// merged with it: this file grows with synonyms, that one doesn't.

/** Every `primary_muscle_group` value observed in the synced Hevy catalog,
 * plus the `other` bucket the aggregation helpers fall back to. */
export const HEVY_MUSCLE_GROUPS = [
  "abdominals",
  "abductors",
  "adductors",
  "biceps",
  "calves",
  "cardio",
  "chest",
  "forearms",
  "full_body",
  "glutes",
  "hamstrings",
  "lats",
  "lower_back",
  "neck",
  "other",
  "quadriceps",
  "shoulders",
  "traps",
  "triceps",
  "upper_back",
] as const;

export type HevyMuscleGroup = (typeof HEVY_MUSCLE_GROUPS)[number];

export interface MuscleSelection {
  /** Human-facing name for the thing that was asked about, e.g. "biceps",
   * "arms", "push". Used verbatim in tool output and reply text — always the
   * canonical spelling, never the user's raw typo. */
  label: string;
  /** The Hevy groups this selection covers. A single-muscle selection has
   * one; a composite ("arms") has several. */
  groups: HevyMuscleGroup[];
}

/** Normalizes a user's muscle word for lookup: lowercase, punctuation and
 * underscores to spaces, collapsed whitespace. "Lower-Back " -> "lower back". */
function normalize(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** One entry per canonical selection; the key list is every phrase that
 * should resolve to it. Order matters only for `SUGGESTIONS` below. */
const MUSCLE_VOCABULARY: Array<MuscleSelection & { aliases: string[] }> = [
  // --- single Hevy groups ---
  {
    label: "chest",
    groups: ["chest"],
    aliases: ["chest", "pecs", "pec", "pectorals", "pectoral"],
  },
  {
    label: "biceps",
    groups: ["biceps"],
    aliases: ["biceps", "bicep", "bis", "bi", "biceps brachii"],
  },
  {
    label: "triceps",
    groups: ["triceps"],
    aliases: ["triceps", "tricep", "tris", "tri"],
  },
  {
    label: "shoulders",
    groups: ["shoulders"],
    aliases: ["shoulders", "shoulder", "delts", "delt", "deltoids", "deltoid"],
  },
  {
    label: "lats",
    groups: ["lats"],
    aliases: ["lats", "lat", "latissimus", "latissimus dorsi"],
  },
  {
    label: "upper back",
    groups: ["upper_back"],
    aliases: ["upper back", "rhomboids", "rhomboid", "mid back", "middle back"],
  },
  {
    label: "lower back",
    groups: ["lower_back"],
    aliases: ["lower back", "erectors", "spinal erectors", "erector spinae"],
  },
  {
    label: "traps",
    groups: ["traps"],
    aliases: ["traps", "trap", "trapezius"],
  },
  {
    label: "forearms",
    groups: ["forearms"],
    aliases: ["forearms", "forearm", "grip"],
  },
  {
    label: "abs",
    groups: ["abdominals"],
    aliases: [
      "abs",
      "ab",
      "abdominals",
      "abdominal",
      "obliques",
      "oblique",
      "stomach",
      "midsection",
    ],
  },
  {
    label: "quads",
    groups: ["quadriceps"],
    aliases: ["quads", "quad", "quadriceps", "thighs", "thigh"],
  },
  {
    label: "hamstrings",
    groups: ["hamstrings"],
    aliases: ["hamstrings", "hamstring", "hams", "ham"],
  },
  {
    label: "glutes",
    groups: ["glutes"],
    aliases: ["glutes", "glute", "butt", "gluteus"],
  },
  {
    label: "calves",
    groups: ["calves"],
    aliases: ["calves", "calf", "soleus", "gastrocnemius"],
  },
  {
    label: "abductors",
    groups: ["abductors"],
    aliases: ["abductors", "abductor", "outer thigh", "hip abductors"],
  },
  {
    label: "adductors",
    groups: ["adductors"],
    aliases: ["adductors", "adductor", "inner thigh", "hip adductors", "groin"],
  },
  {
    label: "neck",
    groups: ["neck"],
    aliases: ["neck"],
  },
  {
    label: "cardio",
    groups: ["cardio"],
    aliases: ["cardio", "conditioning", "aerobic"],
  },
  // --- composites: how people actually group things in conversation ---
  {
    label: "arms",
    groups: ["biceps", "triceps", "forearms"],
    aliases: ["arms", "arm"],
  },
  {
    label: "back",
    groups: ["lats", "upper_back", "lower_back", "traps"],
    aliases: ["back"],
  },
  {
    label: "legs",
    groups: ["quadriceps", "hamstrings", "glutes", "calves", "abductors", "adductors"],
    aliases: ["legs", "leg", "lower body", "lower half"],
  },
  {
    label: "core",
    groups: ["abdominals", "lower_back"],
    aliases: ["core", "trunk"],
  },
  {
    label: "upper body",
    groups: [
      "chest",
      "shoulders",
      "biceps",
      "triceps",
      "forearms",
      "lats",
      "upper_back",
      "lower_back",
      "traps",
    ],
    aliases: ["upper body", "upper half"],
  },
  {
    label: "push",
    groups: ["chest", "shoulders", "triceps"],
    aliases: ["push", "pushing", "push day"],
  },
  {
    label: "pull",
    groups: ["lats", "upper_back", "traps", "lower_back", "biceps", "forearms"],
    aliases: ["pull", "pulling", "pull day"],
  },
  {
    label: "posterior chain",
    groups: ["hamstrings", "glutes", "lower_back", "upper_back"],
    aliases: ["posterior chain", "posterior"],
  },
];

const BY_ALIAS = new Map<string, MuscleSelection>();
for (const { label, groups, aliases } of MUSCLE_VOCABULARY) {
  for (const alias of aliases) {
    BY_ALIAS.set(normalize(alias), { label, groups });
  }
}

/** The canonical labels a failed lookup should suggest — every entry above,
 * in vocabulary order (single muscles first, then composites). */
export const MUSCLE_SUGGESTIONS: string[] = MUSCLE_VOCABULARY.map((entry) => entry.label);

/** Resolves free text to the Hevy muscle groups it refers to, or null if it
 * matches nothing. Tries an exact alias hit, then a naive de-pluralization,
 * then a whole-word containment scan so "how are my left biceps" or "biceps
 * curls" still land — the containment pass prefers the LONGEST matching alias
 * so "lower back" doesn't get grabbed by "back". */
export function resolveMuscleQuery(query: string): MuscleSelection | null {
  const normalized = normalize(query);
  if (!normalized) return null;

  const exact = BY_ALIAS.get(normalized);
  if (exact) return exact;

  const singular = normalized.replace(/s$/, "");
  const depluralized = BY_ALIAS.get(singular) ?? BY_ALIAS.get(`${normalized}s`);
  if (depluralized) return depluralized;

  const words = normalized.split(" ");
  let best: { selection: MuscleSelection; length: number } | null = null;
  for (const [alias, selection] of BY_ALIAS) {
    const aliasWords = alias.split(" ");
    if (!containsSequence(words, aliasWords)) continue;
    if (!best || aliasWords.length > best.length) {
      best = { selection, length: aliasWords.length };
    }
  }
  return best?.selection ?? null;
}

/** Whole-word subsequence test — `["my", "lower", "back"]` contains
 * `["lower", "back"]` but `["backpack"]` contains neither. */
function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    if (needle.every((word, j) => haystack[i + j] === word)) return true;
  }
  return false;
}

/** Pretty form of a raw Hevy group value for display — `lower_back` ->
 * "lower back". (The tool outputs keep the raw snake_case values as keys;
 * this is only for prose.) */
export function muscleGroupLabel(group: string): string {
  return group.replace(/_/g, " ");
}
