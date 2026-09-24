// Pure, deterministic metric calculations shared by worker tools and the web
// dashboard. No I/O, no AI — these are the "deterministic code, not AI math"
// functions called out in PLAN.md. Keep them side-effect free so they stay
// trivially unit-testable.

import type { ActivityLevel, GoalType, Sex } from "./domain.js";

const KCAL_PER_KG = 7700;

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Default weekly rate of change (kg/week) per goal, used when the caller
 * doesn't specify one explicitly. Cut range per PLAN.md is -0.25..-0.5 kg/wk;
 * we default to the midpoint. Bulk defaults to a conservative lean-bulk rate. */
const DEFAULT_RATE_KG_PER_WEEK: Record<GoalType, number> = {
  cut: -0.375,
  maintain: 0,
  bulk: 0.25,
};

interface BmrInput {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
}

/** Mifflin-St Jeor basal metabolic rate, in kcal/day. */
export function bmrMifflinStJeor({ weightKg, heightCm, age, sex }: BmrInput): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

/** Total daily energy expenditure: BMR scaled by activity multiplier. */
export function tdee(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIERS[activityLevel];
}

function ageFromBirthDate(birthDate: string, now: Date): number {
  const bd = new Date(birthDate);
  let age = now.getFullYear() - bd.getFullYear();
  const monthDiff = now.getMonth() - bd.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < bd.getDate())) {
    age -= 1;
  }
  return age;
}

interface ComputeTargetsInput {
  profile: {
    weight_kg: number | null;
    height_cm: number | null;
    birth_date: string | null;
    sex: Sex | null;
    activity_level: ActivityLevel | null;
  };
  goal: GoalType;
  /** kg/week; negative = deficit (cut), positive = surplus (bulk). Defaults per goal. */
  rateKgPerWeek?: number;
  /** Injectable clock for deterministic age calculation in tests. Defaults to now. */
  now?: Date;
}

interface ComputedTargets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  rationale: string;
}

/** Computes macro targets from a profile + goal, per PLAN.md nutrition spec:
 * Mifflin-St Jeor BMR × activity multiplier = TDEE; cut/bulk applies a
 * kcal/day delta from the weekly rate (7700 kcal/kg); protein 2.0 g/kg,
 * fat 0.8 g/kg, remainder carbs. Throws a clear error if the profile is
 * incomplete (missing any of the required fields). */
export function computeTargets({
  profile,
  goal,
  rateKgPerWeek,
  now = new Date(),
}: ComputeTargetsInput): ComputedTargets {
  // weight_kg is reported separately from the settable fields: it's owned by
  // gym sync (written from the latest Hevy weigh-in), so "call profile.update"
  // is the wrong remedy for it — logging a weigh-in in Hevy is.
  const missing: string[] = [];
  if (profile.height_cm == null) missing.push("height_cm");
  if (profile.birth_date == null) missing.push("birth_date");
  if (profile.sex == null) missing.push("sex");
  if (profile.activity_level == null) missing.push("activity_level");
  const problems: string[] = [];
  if (missing.length > 0) {
    problems.push(`profile is missing ${missing.join(", ")} — set them first (profile.update)`);
  }
  if (profile.weight_kg == null) {
    problems.push(
      "no bodyweight on file — it syncs from Hevy weigh-ins, so log one there (or run a gym sync) first",
    );
  }
  if (problems.length > 0) {
    throw new Error(`Cannot compute nutrition targets: ${problems.join("; ")}.`);
  }

  const weightKg = profile.weight_kg as number;
  const heightCm = profile.height_cm as number;
  const age = ageFromBirthDate(profile.birth_date as string, now);
  const sex = profile.sex as Sex;
  const activityLevel = profile.activity_level as ActivityLevel;

  const bmr = bmrMifflinStJeor({ weightKg, heightCm, age, sex });
  const tdeeValue = tdee(bmr, activityLevel);

  const rate = rateKgPerWeek ?? DEFAULT_RATE_KG_PER_WEEK[goal];
  const dailyDeltaKcal = (rate * KCAL_PER_KG) / 7;
  const calories = Math.round(tdeeValue + dailyDeltaKcal);

  const protein_g = Math.round(2.0 * weightKg);
  const fat_g = Math.round(0.8 * weightKg);
  const carbsKcal = Math.max(0, calories - protein_g * 4 - fat_g * 9);
  const carbs_g = Math.round(carbsKcal / 4);

  const deltaRounded = Math.round(dailyDeltaKcal);
  const deltaDescription =
    deltaRounded === 0
      ? "no deficit/surplus (maintain)"
      : deltaRounded < 0
        ? `− ${Math.abs(deltaRounded)} kcal deficit (${goal})`
        : `+ ${deltaRounded} kcal surplus (${goal})`;
  const rationale = `Mifflin-St Jeor TDEE ${Math.round(tdeeValue)} kcal ${deltaDescription}`;

  return { calories, protein_g, carbs_g, fat_g, rationale };
}

interface MacroTargets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/** Scales `current`'s macro grams to a new calorie target, preserving the
 * exact protein/carbs/fat *ratio* (each gram figure scaled by the same
 * calories ratio, then rounded). This is the deterministic helper behind
 * "update target calories to 2000" (PLAN.md nutrition example flow #1): the
 * AI supplies only the new calorie figure and `nutrition.set_targets` calls
 * this instead of trusting the model to redo the macro math itself. */
export function scaleTargetsToCalories(current: MacroTargets, newCalories: number): MacroTargets {
  if (current.calories <= 0) {
    throw new Error("Cannot scale targets: current calorie target must be positive.");
  }
  const ratio = newCalories / current.calories;
  return {
    calories: newCalories,
    protein_g: Math.round(current.protein_g * ratio),
    carbs_g: Math.round(current.carbs_g * ratio),
    fat_g: Math.round(current.fat_g * ratio),
  };
}

interface SetLike {
  weight_kg: number | null;
  reps: number | null;
  set_type?: string | null;
}

/** Total volume (weight_kg × reps, summed), skipping warmup sets. */
export function setVolume(sets: SetLike[]): number {
  return sets.reduce((total, set) => {
    if (set.set_type === "warmup") return total;
    const weight = set.weight_kg ?? 0;
    const reps = set.reps ?? 0;
    return total + weight * reps;
  }, 0);
}

/** Epley estimated 1-rep max. */
export function epley1RM(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

// --- gym: volume / e1RM / PR aggregation (PLAN.md gym module spec) ---

interface SetForMuscleVolume extends SetLike {
  exercise_template_id: string | null;
}

/** Total volume (weight_kg x reps, skipping warmups — same rule as
 * `setVolume`) grouped by primary muscle group, resolved via a
 * template-id -> muscle-group lookup (the cached `gym_exercise_templates`
 * table). Sets whose template is unknown, or whose template has no recorded
 * muscle group, are bucketed under 'other' rather than dropped. */
export function volumeByMuscleGroup(
  sets: SetForMuscleVolume[],
  muscleGroupByTemplateId: Map<string, string | null>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const set of sets) {
    if (set.set_type === "warmup") continue;
    const muscle =
      (set.exercise_template_id && muscleGroupByTemplateId.get(set.exercise_template_id)) ||
      "other";
    const weight = set.weight_kg ?? 0;
    const reps = set.reps ?? 0;
    totals[muscle] = (totals[muscle] ?? 0) + weight * reps;
  }
  return totals;
}

/** The four movement patterns the aggregate progression chart averages by —
 * a reduction of the Hevy `primary_muscle_group` taxonomy along how the work
 * is trained rather than where it sits anatomically. `lower_back` sits with
 * pull — the posterior-chain pulls (deadlift, back extension) are what
 * actually load it. The groups outside these four (`cardio`, `full_body`,
 * `neck`, `other`) have no meaningful pattern, so they get no line of their
 * own; exercises tagged with them still count toward the "all" average. */
export const MOVEMENT_PATTERNS = {
  push: ["chest", "shoulders", "triceps"],
  pull: ["lats", "upper_back", "traps", "lower_back", "biceps", "forearms"],
  legs: ["quadriceps", "hamstrings", "glutes", "calves", "abductors", "adductors"],
  core: ["abdominals"],
} as const satisfies Record<string, readonly string[]>;

type MovementPattern = keyof typeof MOVEMENT_PATTERNS;

const MUSCLE_TO_PATTERN: Record<string, MovementPattern> = Object.fromEntries(
  Object.entries(MOVEMENT_PATTERNS).flatMap(([pattern, muscles]) =>
    muscles.map((muscle) => [muscle, pattern as MovementPattern]),
  ),
);

/** The movement pattern a Hevy muscle group trains, or null for the groups
 * that don't map to one (see `MOVEMENT_PATTERNS`). */
export function movementPatternFor(muscleGroup: string | null | undefined): MovementPattern | null {
  return muscleGroup ? (MUSCLE_TO_PATTERN[muscleGroup] ?? null) : null;
}

interface SetForMuscleLoad extends SetLike {
  exercise_template_id: string | null;
}

export interface MuscleTemplateInfo {
  primary_muscle_group: string | null;
  secondary_muscle_groups: string[] | null;
}

type MuscleLoadMetric = "sets" | "volume";

/** Weighted per-muscle training load (PLAN-gym-expansion.md G3's heatmap
 * attribution model): the set's primary muscle is credited 1.0x, each
 * secondary muscle 0.5x — finally uses `secondary_muscle_groups`, which
 * `volumeByMuscleGroup` (primary-only, kept untouched so the weekly chart
 * and `gym.get_stats` don't shift) ignores. `metric` picks hard-set count
 * (1 per non-warmup set — the default, since it keeps bodyweight/duration
 * exercises with `weight_kg = null` visible) or volume (weight_kg x reps,
 * same warmup skip as `setVolume`). Sets whose template is unknown, or
 * whose template has no muscle groups at all, are bucketed under 'other'. */
export function muscleLoadWeighted(
  sets: SetForMuscleLoad[],
  templates: Map<string, MuscleTemplateInfo>,
  metric: MuscleLoadMetric,
): Record<string, number> {
  const totals: Record<string, number> = {};
  const add = (muscle: string, amount: number) => {
    totals[muscle] = (totals[muscle] ?? 0) + amount;
  };

  for (const set of sets) {
    if (set.set_type === "warmup") continue;
    const amount = metric === "sets" ? 1 : (set.weight_kg ?? 0) * (set.reps ?? 0);
    const template = set.exercise_template_id ? templates.get(set.exercise_template_id) : undefined;
    const secondary = template?.secondary_muscle_groups ?? [];
    if (!template || (!template.primary_muscle_group && secondary.length === 0)) {
      add("other", amount);
      continue;
    }
    if (template.primary_muscle_group) add(template.primary_muscle_group, amount);
    for (const muscle of secondary) add(muscle, amount * 0.5);
  }

  return totals;
}

interface DatedExerciseSet {
  exercise_template_id: string | null;
  exercise_title: string;
  weight_kg: number | null;
  reps: number | null;
  set_type?: string | null;
  /** ISO timestamp of the *workout* this set belongs to (not the set
   * itself — Hevy sets don't carry their own timestamp). */
  workout_start_time: string;
  /** Optional — only populated by callers that need them (RPE overlay /
   * cardio panel, PLAN-gym-expansion.md G4). Functions below that don't use
   * these fields (volumeByMuscleGroup, detectPRs, muscleLoadWeighted, etc.)
   * simply ignore them. */
  rpe?: number | null;
  distance_meters?: number | null;
  duration_seconds?: number | null;
}

/** Identity for grouping sets by exercise: `exercise_template_id` is the
 * stable identity per the hevy-api skill, but custom/untemplated exercises
 * fall back to their title so they still group sensibly. */
function exerciseKey(
  set: Pick<DatedExerciseSet, "exercise_template_id" | "exercise_title">,
): string {
  return set.exercise_template_id ?? `title:${set.exercise_title}`;
}

interface BestE1RM {
  exercise_template_id: string | null;
  exercise_title: string;
  e1rm: number;
}

/** Best (max) e1RM among non-warmup, weight+reps-bearing sets, one entry per
 * exercise. Used as the building block for both `topE1RMChanges` and
 * PR detection. */
export function bestE1RMPerExercise(sets: DatedExerciseSet[]): Map<string, BestE1RM> {
  const best = new Map<string, BestE1RM>();
  for (const set of sets) {
    if (set.set_type === "warmup") continue;
    if (set.weight_kg == null || set.reps == null) continue;
    const e1rm = epley1RM(set.weight_kg, set.reps);
    const key = exerciseKey(set);
    const existing = best.get(key);
    if (!existing || e1rm > existing.e1rm) {
      best.set(key, {
        exercise_template_id: set.exercise_template_id,
        exercise_title: set.exercise_title,
        e1rm,
      });
    }
  }
  return best;
}

interface WorkoutBestSet {
  workout_id: string;
  workout_start_time: string;
  weight_kg: number;
  reps: number;
  e1rm: number;
  /** The RPE logged on this same best set, if any (PLAN-gym-expansion.md
   * G4's optional progression-chart RPE overlay) — `undefined` when the
   * caller's sets don't carry `rpe` at all, distinct from `null` (rpe field
   * present but not logged for this set), so `toEqual` against fixtures
   * built before G4 doesn't need to start asserting a null field. */
  rpe?: number | null;
}

/** The best (max e1RM) non-warmup set per workout, for a single exercise's
 * sets — the progression series behind both the worker's
 * `gym.get_exercise_progress` tool and the web dashboard's per-exercise
 * chart (shared so the two never drift). Sorted chronologically by workout
 * start time. */
export function bestSetPerWorkout(sets: DatedExerciseSetWithWorkout[]): WorkoutBestSet[] {
  const byWorkout = new Map<string, WorkoutBestSet>();
  for (const set of sets) {
    if (set.set_type === "warmup") continue;
    if (set.weight_kg == null || set.reps == null) continue;
    const e1rm = epley1RM(set.weight_kg, set.reps);
    const existing = byWorkout.get(set.workout_id);
    if (!existing || e1rm > existing.e1rm) {
      byWorkout.set(set.workout_id, {
        workout_id: set.workout_id,
        workout_start_time: set.workout_start_time,
        weight_kg: set.weight_kg,
        reps: set.reps,
        e1rm: round2(e1rm),
        ...(set.rpe != null ? { rpe: set.rpe } : {}),
      });
    }
  }
  return [...byWorkout.values()].sort((a, b) =>
    a.workout_start_time.localeCompare(b.workout_start_time),
  );
}

interface E1RMChange {
  exercise_template_id: string | null;
  exercise_title: string;
  e1rm_before: number;
  e1rm_in_period: number;
  delta: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Ranks exercises by estimated-1RM improvement: best e1RM within
 * `[periodStart, +inf)` vs. best e1RM strictly before `periodStart` (0 if
 * there's no prior data at all — a brand-new exercise's entire e1RM counts
 * as "change"). Sorted descending by delta; exercises with no in-period data
 * are excluded (nothing to report). `sets` should span the exercise's whole
 * history, not just the period, so "before" has something to compare against. */
export function topE1RMChanges(
  sets: DatedExerciseSet[],
  periodStart: string,
  topN = 5,
): E1RMChange[] {
  const before = bestE1RMPerExercise(sets.filter((s) => s.workout_start_time < periodStart));
  const inPeriod = bestE1RMPerExercise(sets.filter((s) => s.workout_start_time >= periodStart));

  const changes: E1RMChange[] = [];
  for (const [key, current] of inPeriod) {
    const priorBest = before.get(key)?.e1rm ?? 0;
    changes.push({
      exercise_template_id: current.exercise_template_id,
      exercise_title: current.exercise_title,
      e1rm_before: round2(priorBest),
      e1rm_in_period: round2(current.e1rm),
      delta: round2(current.e1rm - priorBest),
    });
  }
  return changes.sort((a, b) => b.delta - a.delta).slice(0, topN);
}

export interface DatedExerciseSetWithWorkout extends DatedExerciseSet {
  workout_id: string;
}

export interface PREvent {
  exercise_template_id: string | null;
  exercise_title: string;
  workout_id: string;
  workout_start_time: string;
  weight_kg: number;
  reps: number;
  e1rm: number;
  previous_best_e1rm: number;
}

/** Walks sets in chronological order (by the workout's start_time) and
 * records every new all-time-max e1RM per exercise as a PR event. Skips
 * warmups and sets missing weight/reps (bodyweight-reps-only movements
 * aren't scored — v1 PRs are weight x reps lifts only, per PLAN.md's Epley
 * formula). `sets` should span the exercise's whole history for correct
 * "previous best" values, not just a recent window. */
export function detectPRs(sets: DatedExerciseSetWithWorkout[]): PREvent[] {
  const sorted = [...sets].sort((a, b) => a.workout_start_time.localeCompare(b.workout_start_time));
  const runningBest = new Map<string, number>();
  const events: PREvent[] = [];

  for (const set of sorted) {
    if (set.set_type === "warmup") continue;
    if (set.weight_kg == null || set.reps == null) continue;
    const key = exerciseKey(set);
    const e1rm = epley1RM(set.weight_kg, set.reps);
    const prevBest = runningBest.get(key) ?? 0;
    if (e1rm > prevBest) {
      events.push({
        exercise_template_id: set.exercise_template_id,
        exercise_title: set.exercise_title,
        workout_id: set.workout_id,
        workout_start_time: set.workout_start_time,
        weight_kg: set.weight_kg,
        reps: set.reps,
        e1rm: round2(e1rm),
        previous_best_e1rm: round2(prevBest),
      });
      runningBest.set(key, e1rm);
    }
  }
  return events;
}

// --- gym: bodyweight trend (PLAN-gym-expansion.md G2) -----------------------

interface WeightEntry {
  /** YYYY-MM-DD, one entry per day (a Hevy body measurement). */
  date: string;
  weight_kg: number;
}

interface WeightTrendPoint {
  date: string;
  weight_kg: number;
  /** Rolling average over the trailing 7 calendar days (this entry and
   * however many of the previous 6 days have an entry — sparse logging
   * just means a shorter window, not a gap in the series). */
  rolling_avg_kg: number;
}

interface WeightTrend {
  latest_kg: number;
  rolling_avg_kg: number;
  /** Rate of change over the returned window, computed on the smoothed
   * (rolling-average) series rather than raw endpoints — one heavy-meal or
   * dehydrated day at either edge shouldn't swing the reported rate. */
  rate_kg_per_week: number;
  entry_count: number;
  points: WeightTrendPoint[];
}

const ROLLING_WINDOW_DAYS = 7;

function daysBetween(earlier: string, later: string): number {
  return Math.round((new Date(later).getTime() - new Date(earlier).getTime()) / 86_400_000);
}

/** Bodyweight trend from daily (or sparser) weigh-ins: a 7-day rolling-
 * average series plus latest weight and a rate of change computed on that
 * smoothed series. `entries` doesn't need to be sorted or pre-filtered —
 * pass full history (or at least a week of lookback before `periodDays`) so
 * the rolling average has context for the earliest points in the returned
 * window; `periodDays` then limits which points come back (null = all). */
export function weightTrend(entries: WeightEntry[], periodDays: number | null): WeightTrend | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  const smoothed: WeightTrendPoint[] = sorted.map((entry, i) => {
    const window = sorted
      .slice(0, i + 1)
      .filter((e) => daysBetween(e.date, entry.date) < ROLLING_WINDOW_DAYS);
    const avg = window.reduce((sum, e) => sum + e.weight_kg, 0) / window.length;
    return { date: entry.date, weight_kg: entry.weight_kg, rolling_avg_kg: round2(avg) };
  });

  const latest = sorted.at(-1);
  const latestSmoothed = smoothed.at(-1);
  if (!latest || !latestSmoothed) return null;

  const cutoffDate =
    periodDays != null
      ? new Date(new Date(latest.date).getTime() - periodDays * 86_400_000)
          .toISOString()
          .slice(0, 10)
      : null;
  const points = cutoffDate ? smoothed.filter((p) => p.date >= cutoffDate) : smoothed;

  const first = points[0];
  const elapsedDays = first ? Math.max(daysBetween(first.date, latest.date), 1) : 1;
  const rateKgPerWeek =
    first && points.length > 1
      ? ((latestSmoothed.rolling_avg_kg - first.rolling_avg_kg) / elapsedDays) * 7
      : 0;

  return {
    latest_kg: latest.weight_kg,
    rolling_avg_kg: latestSmoothed.rolling_avg_kg,
    rate_kg_per_week: round2(rateKgPerWeek),
    entry_count: sorted.length,
    points,
  };
}

// --- gym: aggregate strength progression -----------------------------------

export type ProgressionSeries = "all" | MovementPattern;

/** Fixed series order for the progression chart's lines, legend, and
 * tooltip — "all" first (it's the headline), then the four patterns. */
export const PROGRESSION_SERIES: ProgressionSeries[] = ["all", "push", "pull", "legs", "core"];

interface ProgressionPoint {
  /** The workout start_time this point is measured at. */
  time: string;
  /** Mean % change in estimated 1RM across the series' exercises, each
   * measured against its own first session in the window. Null before any of
   * the series' exercises has been trained (a leading gap on that line). */
  all: number | null;
  push: number | null;
  pull: number | null;
  legs: number | null;
  core: number | null;
}

interface ProgressionIndex {
  points: ProgressionPoint[];
  /** How many exercises feed each series. "all" counts every tracked
   * exercise, including those whose muscle group maps to no pattern. */
  exercise_counts: Record<ProgressionSeries, number>;
}

/** Sessions an exercise needs within the window before it's tracked: a
 * single session is a flat 0% line that says nothing about progress and only
 * drags every average it's part of toward zero. */
const MIN_SESSIONS_FOR_PROGRESSION = 2;

interface TrackedExercise {
  pattern: MovementPattern | null;
  /** Best (max e1RM) set per session, chronological — from `bestSetPerWorkout`. */
  sessions: WorkoutBestSet[];
  /** e1RM of the first session in the window; every point is a % change against it. */
  baseline: number;
  /** Index into `sessions` of the latest session at or before the point
   * currently being computed; -1 until the exercise's first session. */
  cursor: number;
}

/** The e1RM of a session's best set at full precision. `WorkoutBestSet.e1rm`
 * is rounded to 2dp for display, which is plenty to *show* but not to divide
 * by: 128.33/116.67 reads as +9.99% where the real lift is exactly +10%. The
 * set itself was still chosen by `bestSetPerWorkout`, so this only recovers
 * precision — it can't disagree with it about which set won. */
function sessionE1RM(session: WorkoutBestSet): number {
  return epley1RM(session.weight_kg, session.reps);
}

/** Average strength progression across every exercise trained in the window,
 * as one "all" line plus one line per movement pattern (push/pull/legs/core).
 *
 * Absolute e1RM can't be averaged across exercises — a 75 kg chest press and
 * a 14 kg lateral raise would just give you a number dominated by whichever
 * lift is heaviest. So each exercise is indexed against its own first session
 * in the window and the chart averages those % changes, which is what "am I
 * getting stronger overall?" actually means.
 *
 * The x-axis is every session any tracked exercise was trained on. Between
 * its own sessions an exercise holds its last known e1RM, so a line moves
 * only when something it tracks was actually trained — a bench-only day
 * doesn't drop the legs line.
 *
 * `sets` should be the full history; `periodStart` (ISO, null = all time)
 * bounds the window, and baselines are taken from inside it — this measures
 * progress *within* the window, not against all-time history before it.
 * `muscleGroupByTemplateId` maps template id to Hevy `primary_muscle_group`;
 * an exercise with no template (or an unmapped group) still counts toward
 * "all" but gets no pattern line. */
export function progressionIndex(
  sets: DatedExerciseSetWithWorkout[],
  muscleGroupByTemplateId: Map<string, string | null>,
  periodStart: string | null,
): ProgressionIndex {
  const byExercise = new Map<string, DatedExerciseSetWithWorkout[]>();
  for (const set of sets) {
    if (periodStart && set.workout_start_time < periodStart) continue;
    const key = exerciseKey(set);
    const existing = byExercise.get(key);
    if (existing) existing.push(set);
    else byExercise.set(key, [set]);
  }

  const tracked: TrackedExercise[] = [];
  for (const exerciseSets of byExercise.values()) {
    const sessions = bestSetPerWorkout(exerciseSets);
    if (sessions.length < MIN_SESSIONS_FOR_PROGRESSION) continue;
    const first = sessions[0];
    if (!first || first.e1rm <= 0) continue;
    const templateId = exerciseSets[0]?.exercise_template_id ?? null;
    const muscleGroup = templateId ? (muscleGroupByTemplateId.get(templateId) ?? null) : null;
    tracked.push({
      pattern: movementPatternFor(muscleGroup),
      sessions,
      baseline: sessionE1RM(first),
      cursor: -1,
    });
  }

  const exercise_counts: Record<ProgressionSeries, number> = {
    all: 0,
    push: 0,
    pull: 0,
    legs: 0,
    core: 0,
  };
  for (const exercise of tracked) {
    exercise_counts.all += 1;
    if (exercise.pattern) exercise_counts[exercise.pattern] += 1;
  }

  const axis = [
    ...new Set(tracked.flatMap((e) => e.sessions.map((s) => s.workout_start_time))),
  ].sort();

  const points = axis.map((time): ProgressionPoint => {
    const totals: Record<ProgressionSeries, { sum: number; count: number }> = {
      all: { sum: 0, count: 0 },
      push: { sum: 0, count: 0 },
      pull: { sum: 0, count: 0 },
      legs: { sum: 0, count: 0 },
      core: { sum: 0, count: 0 },
    };

    for (const exercise of tracked) {
      // Advance this exercise's cursor to its latest session at or before
      // `time`; the axis is ascending, so cursors only ever move forward.
      let next = exercise.sessions[exercise.cursor + 1];
      while (next && next.workout_start_time <= time) {
        exercise.cursor += 1;
        next = exercise.sessions[exercise.cursor + 1];
      }
      const current = exercise.sessions[exercise.cursor];
      if (!current) continue; // not trained yet at this point in the window
      const pct = (sessionE1RM(current) / exercise.baseline - 1) * 100;
      totals.all.sum += pct;
      totals.all.count += 1;
      if (exercise.pattern) {
        totals[exercise.pattern].sum += pct;
        totals[exercise.pattern].count += 1;
      }
    }

    const mean = (t: { sum: number; count: number }) =>
      t.count > 0 ? round2(t.sum / t.count) : null;
    return {
      time,
      all: mean(totals.all),
      push: mean(totals.push),
      pull: mean(totals.pull),
      legs: mean(totals.legs),
      core: mean(totals.core),
    };
  });

  return { points, exercise_counts };
}
