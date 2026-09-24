// Pure view-model helpers for the training module: turning raw workout_sets/
// workouts/exercise_templates rows into what the weekly volume
// chart, exercise picker/progression chart, recent-workouts list, and PR
// feed actually render. Dependency-free (no Supabase, no React) — same
// convention as ../nutrition/derive.ts and ../routines/derive.ts. Reuses
// @liftledger/shared's metrics helpers rather than reimplementing volume/e1RM
// math client-side (PLAN.md: derived metrics live in one shared place).

import type {
  DatedExerciseSetWithWorkout,
  MuscleTemplateInfo,
  PREvent,
  Tables,
} from "@liftledger/shared";
import { epley1RM, formatVolume, setVolume, volumeByMuscleGroup } from "@liftledger/shared";
import { weekStartLocalDate } from "./date";
import type { SetWithWorkoutMeta } from "./queries";

export type WorkoutRow = Tables<"workouts">;
export type TemplateRow = Tables<"exercise_templates">;

export interface WeeklyVolumePoint {
  week_start: string;
  total: number;
  byMuscle: Record<string, number>;
  /** Distinct workouts (sessions) that fell in this week — the gym
   * overview card's "this week's sessions" figure reuses this rather than
   * a separate count query. */
  sessionCount: number;
}

/** Buckets sets into Monday-starting weeks over the trailing `weeksBack`
 * weeks (including the current week), filling empty weeks with zero so the
 * chart's x-axis is continuous. Returns the muscle groups present anywhere
 * in the window (sorted by total volume descending) alongside the points,
 * so the chart component knows which stacked series to render. */
export function weeklyVolumeSeries(
  sets: DatedExerciseSetWithWorkout[],
  muscleGroupByTemplateId: Map<string, string | null>,
  weeksBack: number,
  today: Date,
): { points: WeeklyVolumePoint[]; muscles: string[] } {
  const weekStarts: string[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    weekStarts.push(weekStartLocalDate(d));
  }

  const buckets = new Map<string, DatedExerciseSetWithWorkout[]>(weekStarts.map((w) => [w, []]));
  for (const set of sets) {
    const week = weekStartLocalDate(new Date(set.workout_start_time));
    buckets.get(week)?.push(set);
  }

  const muscleTotals = new Map<string, number>();
  const points: WeeklyVolumePoint[] = weekStarts.map((week_start) => {
    const bucketSets = buckets.get(week_start) ?? [];
    const byMuscle = volumeByMuscleGroup(bucketSets, muscleGroupByTemplateId);
    for (const [muscle, vol] of Object.entries(byMuscle)) {
      muscleTotals.set(muscle, (muscleTotals.get(muscle) ?? 0) + vol);
    }
    const total = Object.values(byMuscle).reduce((sum, v) => sum + v, 0);
    const sessionCount = new Set(bucketSets.map((s) => s.workout_id)).size;
    return { week_start, total, byMuscle, sessionCount };
  });

  const muscles = [...muscleTotals.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
  return { points, muscles };
}

/** The week-over-week volume delta, phrased once for both surfaces that
 * report it (the gym page's `WeeklyPanel` and the overview grid's
 * `GymOverviewCard`) so the two can't drift into saying it differently.
 * `positive` drives the caller's ink color. */
export function volumeDeltaLabel(
  thisWeek: number,
  lastWeek: number,
): { text: string; positive: boolean } {
  const delta = thisWeek - lastWeek;
  if (lastWeek === 0 && thisWeek === 0) return { text: "no volume yet", positive: true };
  if (delta === 0) return { text: "same as last week", positive: true };
  return {
    text: `${delta > 0 ? "+" : "−"}${formatVolume(Math.abs(delta))} vs last week`,
    positive: delta >= 0,
  };
}

/** Weeks from the account's first-ever workout through `today` (inclusive),
 * capped at `maxWeeks` — clamps the volume chart's window so a young
 * account doesn't render a row of empty leading bars (PLAN-gym-expansion.md
 * G1). Returns `maxWeeks` unchanged when there's no data yet (nothing to
 * clamp against). */
export function effectiveVolumeWeeks(
  sets: DatedExerciseSetWithWorkout[],
  maxWeeks: number,
  today: Date,
): number {
  if (sets.length === 0) return maxWeeks;
  const earliest = sets.reduce(
    (min, s) => (s.workout_start_time < min ? s.workout_start_time : min),
    sets[0]?.workout_start_time ?? "",
  );
  const earliestWeekStart = weekStartLocalDate(new Date(earliest));
  const todayWeekStart = weekStartLocalDate(today);
  const weeksBetween = Math.round(
    (new Date(`${todayWeekStart}T00:00:00`).getTime() -
      new Date(`${earliestWeekStart}T00:00:00`).getTime()) /
      (7 * 86_400_000),
  );
  return Math.min(maxWeeks, weeksBetween + 1);
}

export interface WorkoutSummary {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string | null;
  total_volume_kg: number;
  exercise_count: number;
  set_count: number;
  exercises: Array<{ title: string; sets: SetWithWorkoutMeta[] }>;
}

/** Groups a flat set list by workout, computing each workout's summary
 * (volume, counts) plus its sets grouped by exercise (in original
 * exercise_index/set_index order) — the shape the expandable recent-
 * workouts list renders directly. Takes the full `useAllSetsWithWorkoutMeta`
 * result rather than a per-workout query: it already groups by `workout_id`
 * internally, so passing the whole set list and letting it ignore anything
 * outside `workouts` costs nothing extra and saves a second round-trip. */
export function summarizeWorkouts(
  workouts: WorkoutRow[],
  sets: SetWithWorkoutMeta[],
): WorkoutSummary[] {
  const setsByWorkout = new Map<string, SetWithWorkoutMeta[]>();
  for (const set of sets) {
    const list = setsByWorkout.get(set.workout_id) ?? [];
    list.push(set);
    setsByWorkout.set(set.workout_id, list);
  }

  return workouts.map((w) => {
    const workoutSets = (setsByWorkout.get(w.id) ?? [])
      .slice()
      .sort((a, b) => a.exercise_index - b.exercise_index || a.set_index - b.set_index);

    const byExercise = new Map<string, SetWithWorkoutMeta[]>();
    for (const set of workoutSets) {
      const list = byExercise.get(set.exercise_title) ?? [];
      list.push(set);
      byExercise.set(set.exercise_title, list);
    }

    return {
      id: w.id,
      title: w.title,
      start_time: w.start_time,
      end_time: w.end_time,
      total_volume_kg: setVolume(workoutSets),
      exercise_count: byExercise.size,
      set_count: workoutSets.length,
      exercises: [...byExercise.entries()].map(([title, exSets]) => ({ title, sets: exSets })),
    };
  });
}

/** Collapses multiple PRs for the same exercise in the same workout down to
 * the single best (highest e1RM) one — a heavy leg day can produce several
 * same-exercise PRs (e.g. two Back Extension entries), which both floods the
 * PR feed with near-duplicate rows and, since `(workout_id, exercise)` was
 * used as the feed's React key, caused duplicate/dropped rows. Order among
 * distinct keys follows first-seen order (input is already chronological). */
export function bestPRPerWorkout(prs: PREvent[]): PREvent[] {
  const best = new Map<string, PREvent>();
  for (const pr of prs) {
    const key = `${pr.workout_id}:${pr.exercise_template_id ?? pr.exercise_title}`;
    const existing = best.get(key);
    if (!existing || pr.e1rm > existing.e1rm) best.set(key, pr);
  }
  return [...best.values()];
}

/** Builds the `templateId -> {primary, secondary[]}` lookup `muscleLoadWeighted`
 * needs, from the full template rows `useExerciseTemplates()` fetches (unlike
 * the worker's `fetchTemplateMuscleMap`, which is primary-group-only and
 * insufficient for the heatmap's secondary-muscle attribution). */
export function templateMuscleMap(templates: TemplateRow[]): Map<string, MuscleTemplateInfo> {
  return new Map(
    templates.map((t) => [
      t.id,
      {
        primary_muscle_group: t.primary_muscle_group,
        secondary_muscle_groups: t.secondary_muscle_groups,
      },
    ]),
  );
}

/** Most recent workout a muscle group was trained (primary or secondary —
 * membership only, not weighted), from the full set history rather than
 * whatever period the heatmap's intensity ramp is scoped to — "when did I
 * last train this at all" is more useful here than a period-bounded answer
 * (PLAN-gym-expansion.md G3's heatmap tooltip + "least trained" list). */
export function muscleLastTrained(
  sets: DatedExerciseSetWithWorkout[],
  templates: Map<string, MuscleTemplateInfo>,
): Record<string, string> {
  const latest: Record<string, string> = {};
  const touch = (muscle: string, time: string) => {
    if (!latest[muscle] || time > latest[muscle]) latest[muscle] = time;
  };
  for (const set of sets) {
    if (set.set_type === "warmup") continue;
    const template = set.exercise_template_id ? templates.get(set.exercise_template_id) : undefined;
    if (!template) continue;
    if (template.primary_muscle_group) touch(template.primary_muscle_group, set.workout_start_time);
    for (const muscle of template.secondary_muscle_groups ?? [])
      touch(muscle, set.workout_start_time);
  }
  return latest;
}

interface MuscleExerciseStat {
  /** `exercise_template_id` when the exercise has one, else its title —
   * same grouping identity `exercisesFromSets` uses. */
  key: string;
  title: string;
  /** Raw set count, NOT halved for secondary work: "4 sets of Bench Press"
   * is what was actually performed, and a fractional count would read as a
   * bug. The 0.5 secondary weighting stays where it drives comparison — the
   * figure's intensity ramp and this panel's totals (`muscleLoadWeighted`) —
   * while `isSecondary` carries that distinction into the row instead. */
  sets: number;
  volumeKg: number;
  /** Heaviest set by e1RM (skipping bodyweight/unweighted sets, which have
   * no meaningful "heaviest"). */
  bestSet: { weightKg: number; reps: number } | null;
  /** True when this muscle is one of the exercise's *secondary* groups
   * rather than its primary target. */
  isSecondary: boolean;
}

export interface MuscleBreakdown {
  /** Distinct workouts that trained this muscle in the window. */
  sessions: number;
  /** Most-trained first (by set count, then volume) — bodyweight work has
   * zero volume, so ranking on volume alone would bury it. */
  exercises: MuscleExerciseStat[];
}

/** Per-exercise breakdown of one muscle group's work over the given sets —
 * what the heatmap's detail panel lists when a region is hovered/tapped.
 * Membership mirrors `muscleLoadWeighted`'s bucketing exactly (warmups
 * skipped, primary + secondary groups both count, templateless sets fall
 * back to "other"), so a muscle that's warm on the figure always has rows
 * here and vice versa. */
export function muscleBreakdown(
  sets: DatedExerciseSetWithWorkout[],
  templates: Map<string, MuscleTemplateInfo>,
  muscle: string,
): MuscleBreakdown {
  const byExercise = new Map<string, MuscleExerciseStat>();
  const workoutIds = new Set<string>();

  for (const set of sets) {
    if (set.set_type === "warmup") continue;
    const template = set.exercise_template_id ? templates.get(set.exercise_template_id) : undefined;
    const secondary = template?.secondary_muscle_groups ?? [];

    let isSecondary: boolean;
    if (!template || (!template.primary_muscle_group && secondary.length === 0)) {
      // `muscleLoadWeighted`'s unknown-template fallback bucket.
      if (muscle !== "other") continue;
      isSecondary = false;
    } else if (template.primary_muscle_group === muscle) {
      isSecondary = false;
    } else if (secondary.includes(muscle)) {
      isSecondary = true;
    } else {
      continue;
    }

    workoutIds.add(set.workout_id);
    const key = set.exercise_template_id ?? set.exercise_title;
    const stat = byExercise.get(key) ?? {
      key,
      title: set.exercise_title,
      sets: 0,
      volumeKg: 0,
      bestSet: null,
      isSecondary,
    };
    stat.sets += 1;
    stat.volumeKg += (set.weight_kg ?? 0) * (set.reps ?? 0);

    const weightKg = set.weight_kg ?? 0;
    const reps = set.reps ?? 0;
    if (weightKg > 0 && reps > 0) {
      const isBest =
        !stat.bestSet ||
        epley1RM(weightKg, reps) > epley1RM(stat.bestSet.weightKg, stat.bestSet.reps);
      if (isBest) stat.bestSet = { weightKg, reps };
    }
    byExercise.set(key, stat);
  }

  const exercises = [...byExercise.values()].sort(
    (a, b) => b.sets - a.sets || b.volumeKg - a.volumeKg,
  );
  return { sessions: workoutIds.size, exercises };
}

/** Consecutive most-recent weeks with at least one session, walking
 * backward from `points`' last entry (PLAN-gym-expansion.md G4's
 * consistency panel). The current (most recent) week is exempt from
 * breaking the streak if it has zero sessions so far — same "today's not
 * done yet" exemption as routines' `computeStreaks`, just at week
 * granularity: the week isn't over, so an empty week-in-progress shouldn't
 * read as a broken streak. */
export function weeklySessionStreak(points: WeeklyVolumePoint[]): number {
  let current = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i];
    if (!point) break;
    if (point.sessionCount === 0) {
      if (i === points.length - 1) continue;
      break;
    }
    current++;
  }
  return current;
}

export interface CardioTotals {
  durationSeconds: number;
  distanceMeters: number;
  sessionCount: number;
}

/** This week's cardio totals (PLAN-gym-expansion.md G4: "distance_meters/
 * duration_seconds are stored but invisible — a small weekly cardio
 * minutes/distance panel"). A set counts as cardio purely by having one of
 * these fields populated — running/cycling/rowing exercises log them,
 * weight-training exercises don't — independent of the exercise's
 * `primary_muscle_group` tag (which may or may not be literally "cardio"). */
export function cardioTotals(sets: DatedExerciseSetWithWorkout[], today: Date): CardioTotals {
  const weekStart = weekStartLocalDate(today);
  let durationSeconds = 0;
  let distanceMeters = 0;
  const workoutIds = new Set<string>();
  for (const s of sets) {
    if (s.workout_start_time < weekStart) continue;
    if (s.duration_seconds == null && s.distance_meters == null) continue;
    durationSeconds += s.duration_seconds ?? 0;
    distanceMeters += s.distance_meters ?? 0;
    workoutIds.add(s.workout_id);
  }
  return { durationSeconds, distanceMeters, sessionCount: workoutIds.size };
}

/** Whether the account has ANY cardio-type set in its whole history — the
 * gate GymPage uses to decide whether the cardio panel renders at all
 * (PLAN-gym-expansion.md G4: "rendered only when cardio sets exist"). */
export function hasCardioSets(sets: DatedExerciseSetWithWorkout[]): boolean {
  return sets.some((s) => s.duration_seconds != null || s.distance_meters != null);
}
