// Comparative gym analysis: the layer that turns raw sets into "your biceps
// are up 8.3% on estimated 1RM, and that's strength rather than volume —
// you did 4 fewer sets".
//
// metrics.ts already answers "what is my number" (volume, e1RM, PRs,
// per-session series). Everything here answers "how did that number MOVE,
// against what, and why" — window-scoped aggregation, percentage deltas,
// and a driver classification separating a strength gain from a volume gain.
// Same rules as metrics.ts: pure, deterministic, no I/O, no AI. The AI's job
// is to phrase these numbers, never to compute them.

import { epley1RM } from "./metrics.js";
import type { DatedExerciseSetWithWorkout, MuscleTemplateInfo } from "./metrics.js";
import type { HevyMuscleGroup } from "./muscles.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- percentage deltas -----------------------------------------------------

export interface MetricDelta {
  current: number;
  previous: number;
  delta: number;
  /** Percent change from `previous` to `current`, or null when there is no
   * baseline to divide by (`previous` is 0). Null is deliberately NOT 0 or
   * Infinity: "went from nothing to something" is a real, reportable state
   * that a percentage genuinely cannot express, and the model needs to be
   * able to tell it apart from "unchanged". */
  pct_change: number | null;
}

/** Percent change from `previous` to `current`, null when `previous` is 0.
 * Uses |previous| as the denominator so a negative baseline (only reachable
 * via bodyweight-style deltas, but cheap to be correct about) doesn't flip
 * the sign of the reported change. */
export function pctChange(previous: number, current: number): number | null {
  if (previous === 0) return null;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

export function metricDelta(previous: number, current: number): MetricDelta {
  return {
    current: round2(current),
    previous: round2(previous),
    delta: round2(current - previous),
    pct_change: pctChange(previous, current),
  };
}

/** "+8.3%" / "−4%" / "n/a" — the display form of a `pct_change`. Uses a real
 * minus sign, matching the rest of the app's display strings. */
export function formatPct(pct: number | null): string {
  if (pct == null) return "n/a";
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return "0%";
  return rounded > 0 ? `+${rounded}%` : `−${Math.abs(rounded)}%`;
}

// --- per-window, per-exercise aggregation ----------------------------------

export interface SessionPoint {
  workout_id: string;
  workout_start_time: string;
  /** The session's best (max e1RM) working set. */
  weight_kg: number;
  reps: number;
  e1rm: number;
  /** Every working set of this exercise in that session, summed. */
  session_volume_kg: number;
  hard_sets: number;
}

export interface ExerciseWindowStats {
  exercise_template_id: string | null;
  exercise_title: string;
  /** Distinct workouts this exercise appeared in — the frequency dimension. */
  sessions: number;
  /** Non-warmup sets. Named "hard sets" because that's the training term for
   * exactly this count, and it's the unit hypertrophy volume is usually
   * prescribed in. */
  hard_sets: number;
  total_reps: number;
  volume_kg: number;
  /** Best estimated 1RM across the window; 0 when no set carried both a
   * weight and reps (bodyweight/duration-only movements). */
  best_e1rm: number;
  heaviest_weight_kg: number;
  /** Mean load per rep (volume / reps) — the intensity dimension. Rises when
   * the same reps are done heavier, unlike volume, which also rises from
   * simply doing more sets. */
  avg_weight_kg: number;
  avg_reps_per_set: number;
  volume_per_session_kg: number;
  /** Chronologically first / last / best session in the window. Null only
   * when the exercise has no scored (weight+reps) set at all. */
  first_session: SessionPoint | null;
  last_session: SessionPoint | null;
  best_session: SessionPoint | null;
}

/** Identity for grouping sets by exercise — mirrors metrics.ts's private
 * `exerciseKey` exactly (template id, falling back to title for custom
 * exercises) so the two files never disagree about what "one exercise" is. */
export function exerciseKey(
  set: Pick<DatedExerciseSetWithWorkout, "exercise_template_id" | "exercise_title">,
): string {
  return set.exercise_template_id ?? `title:${set.exercise_title}`;
}

function isWorkingSet(set: DatedExerciseSetWithWorkout): boolean {
  return set.set_type !== "warmup";
}

/** Aggregates a window's sets into one `ExerciseWindowStats` per exercise.
 * `sets` should ALREADY be filtered to the window of interest — this function
 * has no notion of time bounds, which is what lets the same code serve
 * "this week", "last week", and "the 90 days before that" identically. */
export function statsByExercise(
  sets: DatedExerciseSetWithWorkout[],
): Map<string, ExerciseWindowStats> {
  interface Accumulator {
    stats: ExerciseWindowStats;
    /** Per-workout scratch, collapsed into session points at the end. */
    sessions: Map<string, SessionPoint>;
  }

  const acc = new Map<string, Accumulator>();

  for (const set of sets) {
    if (!isWorkingSet(set)) continue;
    const key = exerciseKey(set);
    let entry = acc.get(key);
    if (!entry) {
      entry = {
        stats: {
          exercise_template_id: set.exercise_template_id,
          exercise_title: set.exercise_title,
          sessions: 0,
          hard_sets: 0,
          total_reps: 0,
          volume_kg: 0,
          best_e1rm: 0,
          heaviest_weight_kg: 0,
          avg_weight_kg: 0,
          avg_reps_per_set: 0,
          volume_per_session_kg: 0,
          first_session: null,
          last_session: null,
          best_session: null,
        },
        sessions: new Map(),
      };
      acc.set(key, entry);
    }

    const { stats, sessions } = entry;
    const weight = set.weight_kg ?? 0;
    const reps = set.reps ?? 0;
    stats.hard_sets += 1;
    stats.total_reps += reps;
    stats.volume_kg += weight * reps;
    if (weight > stats.heaviest_weight_kg) stats.heaviest_weight_kg = weight;

    let session = sessions.get(set.workout_id);
    if (!session) {
      session = {
        workout_id: set.workout_id,
        workout_start_time: set.workout_start_time,
        weight_kg: 0,
        reps: 0,
        e1rm: 0,
        session_volume_kg: 0,
        hard_sets: 0,
      };
      sessions.set(set.workout_id, session);
    }
    session.hard_sets += 1;
    session.session_volume_kg += weight * reps;
    if (set.weight_kg != null && set.reps != null) {
      const e1rm = epley1RM(set.weight_kg, set.reps);
      if (e1rm > session.e1rm) {
        session.e1rm = e1rm;
        session.weight_kg = set.weight_kg;
        session.reps = set.reps;
      }
    }
  }

  const out = new Map<string, ExerciseWindowStats>();
  for (const [key, { stats, sessions }] of acc) {
    const ordered = [...sessions.values()].sort((a, b) =>
      a.workout_start_time.localeCompare(b.workout_start_time),
    );
    // Sessions where nothing was scoreable (e.g. an all-bodyweight movement)
    // still count toward frequency/volume, but can't anchor a strength trend.
    const scored = ordered.filter((s) => s.e1rm > 0);
    const best = scored.reduce<SessionPoint | null>(
      (bestSoFar, s) => (!bestSoFar || s.e1rm > bestSoFar.e1rm ? s : bestSoFar),
      null,
    );

    stats.sessions = ordered.length;
    stats.best_e1rm = round2(best?.e1rm ?? 0);
    stats.volume_kg = round2(stats.volume_kg);
    stats.heaviest_weight_kg = round2(stats.heaviest_weight_kg);
    stats.avg_weight_kg = stats.total_reps > 0 ? round2(stats.volume_kg / stats.total_reps) : 0;
    stats.avg_reps_per_set = stats.hard_sets > 0 ? round2(stats.total_reps / stats.hard_sets) : 0;
    stats.volume_per_session_kg = ordered.length > 0 ? round2(stats.volume_kg / ordered.length) : 0;
    stats.first_session = roundSession(scored[0] ?? null);
    stats.last_session = roundSession(scored.at(-1) ?? null);
    stats.best_session = roundSession(best);
    out.set(key, stats);
  }
  return out;
}

/** A session's e1RM at FULL precision, recomputed from the set that produced
 * it. `SessionPoint.e1rm` is rounded to 2dp because that's what gets shown,
 * and dividing two rounded e1RMs is exactly the trap `sessionE1RM` in
 * metrics.ts documents: 29.33/26.67 reads as +9.97% where the real lift (22 kg
 * vs 20 kg for the same reps) is exactly +10%. Every percentage in this file
 * goes through here; only the DISPLAYED number is ever rounded. Returns 0 for
 * a missing session so a "no baseline" comparison lands on `pctChange`'s null
 * path rather than dividing by a rounded zero. */
function exactE1RM(session: SessionPoint | null): number {
  return session ? epley1RM(session.weight_kg, session.reps) : 0;
}

function roundSession(session: SessionPoint | null): SessionPoint | null {
  if (!session) return null;
  return {
    ...session,
    e1rm: round2(session.e1rm),
    session_volume_kg: round2(session.session_volume_kg),
  };
}

// --- driver classification -------------------------------------------------

export type ProgressDriver =
  /** Lifting heavier: estimated 1RM up, without needing more work to do it. */
  | "strength"
  /** Doing more work: volume up, top-end strength roughly flat. */
  | "volume"
  /** Both moved up together — the best case. */
  | "both"
  /** Volume up purely because the exercise was trained more often, with
   * per-session work and strength flat. */
  | "frequency"
  /** Both strength and volume down. */
  | "regression"
  /** Neither moved outside the noise band. */
  | "maintained"
  /** Trained in the current window, absent from the baseline — no comparison
   * is possible, and reporting it as an infinite gain would be a lie. */
  | "new"
  /** Present in the baseline, not trained at all in the current window. */
  | "dropped";

/** Below this |%| change, an estimated 1RM is treated as flat. e1RM is
 * derived from a rounded plate weight through Epley, so a single rep more or
 * less on a light set moves it a percent or so without meaning anything. */
const STRENGTH_NOISE_PCT = 1.5;

/** Volume swings much more than strength does session to session (one extra
 * set can be +20%), so it needs a wider band before it counts as a real move. */
const VOLUME_NOISE_PCT = 7.5;

export interface DriverInput {
  e1rm_pct: number | null;
  volume_pct: number | null;
  sessions_pct?: number | null;
  volume_per_session_pct?: number | null;
}

/** Classifies WHY a number moved. This is the "nuance" layer: without it,
 * "bicep volume +18%" reads as progress even when it's purely three extra
 * sets at the same weight, and "+2 kg on curls" reads as small even when it's
 * the only thing that moved. */
export function classifyDriver({
  e1rm_pct,
  volume_pct,
  sessions_pct,
  volume_per_session_pct,
}: DriverInput): ProgressDriver {
  const strongerUp = e1rm_pct != null && e1rm_pct >= STRENGTH_NOISE_PCT;
  const strongerDown = e1rm_pct != null && e1rm_pct <= -STRENGTH_NOISE_PCT;
  const volumeUp = volume_pct != null && volume_pct >= VOLUME_NOISE_PCT;
  const volumeDown = volume_pct != null && volume_pct <= -VOLUME_NOISE_PCT;

  if (strongerUp && volumeUp) return "both";
  if (strongerUp) return "strength";
  if (volumeUp) {
    // More total work, but none of it per session and none of it heavier —
    // the gain is simply showing up more often.
    const perSessionFlat =
      volume_per_session_pct == null || Math.abs(volume_per_session_pct) < VOLUME_NOISE_PCT;
    const trainedMoreOften = sessions_pct != null && sessions_pct > 0;
    return perSessionFlat && trainedMoreOften ? "frequency" : "volume";
  }
  if (strongerDown && volumeDown) return "regression";
  return "maintained";
}

// --- window-vs-window comparison -------------------------------------------

export interface ExerciseComparison {
  exercise_template_id: string | null;
  exercise_title: string;
  primary_muscle_group: string | null;
  driver: ProgressDriver;
  sessions: MetricDelta;
  hard_sets: MetricDelta;
  total_reps: MetricDelta;
  volume_kg: MetricDelta;
  volume_per_session_kg: MetricDelta;
  best_e1rm: MetricDelta;
  /** Mean load per rep — separates "heavier" from "more". */
  avg_weight_kg: MetricDelta;
  heaviest_weight_kg: MetricDelta;
  best_set_current: { weight_kg: number; reps: number } | null;
  best_set_previous: { weight_kg: number; reps: number } | null;
}

const EMPTY_STATS: Omit<ExerciseWindowStats, "exercise_template_id" | "exercise_title"> = {
  sessions: 0,
  hard_sets: 0,
  total_reps: 0,
  volume_kg: 0,
  best_e1rm: 0,
  heaviest_weight_kg: 0,
  avg_weight_kg: 0,
  avg_reps_per_set: 0,
  volume_per_session_kg: 0,
  first_session: null,
  last_session: null,
  best_session: null,
};

function bestSetOf(stats: ExerciseWindowStats): { weight_kg: number; reps: number } | null {
  const best = stats.best_session;
  return best ? { weight_kg: best.weight_kg, reps: best.reps } : null;
}

/** Compares two already-windowed set lists exercise by exercise. Exercises
 * present in only one window still come back (as `new` / `dropped`) — a
 * comparison that silently omitted the lift you started or abandoned would be
 * the most misleading kind of report. Sorted by current-window volume
 * descending, with dropped exercises last. */
export function compareExercises(
  previousSets: DatedExerciseSetWithWorkout[],
  currentSets: DatedExerciseSetWithWorkout[],
  muscleGroupByTemplateId: Map<string, string | null>,
): ExerciseComparison[] {
  const previous = statsByExercise(previousSets);
  const current = statsByExercise(currentSets);

  const comparisons: ExerciseComparison[] = [];
  for (const key of new Set([...current.keys(), ...previous.keys()])) {
    const cur = current.get(key);
    const prev = previous.get(key);
    const identity = cur ?? prev;
    if (!identity) continue;

    const c: ExerciseWindowStats = cur ?? {
      exercise_template_id: identity.exercise_template_id,
      exercise_title: identity.exercise_title,
      ...EMPTY_STATS,
    };
    const p: ExerciseWindowStats = prev ?? {
      exercise_template_id: identity.exercise_template_id,
      exercise_title: identity.exercise_title,
      ...EMPTY_STATS,
    };

    const volume = metricDelta(p.volume_kg, c.volume_kg);
    const e1rm = metricDelta(exactE1RM(p.best_session), exactE1RM(c.best_session));
    const sessions = metricDelta(p.sessions, c.sessions);
    const perSession = metricDelta(p.volume_per_session_kg, c.volume_per_session_kg);

    const driver: ProgressDriver = !prev
      ? "new"
      : !cur
        ? "dropped"
        : classifyDriver({
            e1rm_pct: e1rm.pct_change,
            volume_pct: volume.pct_change,
            sessions_pct: sessions.pct_change,
            volume_per_session_pct: perSession.pct_change,
          });

    const templateId = identity.exercise_template_id;
    comparisons.push({
      exercise_template_id: templateId,
      exercise_title: identity.exercise_title,
      primary_muscle_group: templateId ? (muscleGroupByTemplateId.get(templateId) ?? null) : null,
      driver,
      sessions,
      hard_sets: metricDelta(p.hard_sets, c.hard_sets),
      total_reps: metricDelta(p.total_reps, c.total_reps),
      volume_kg: volume,
      volume_per_session_kg: perSession,
      best_e1rm: e1rm,
      avg_weight_kg: metricDelta(p.avg_weight_kg, c.avg_weight_kg),
      heaviest_weight_kg: metricDelta(p.heaviest_weight_kg, c.heaviest_weight_kg),
      best_set_current: bestSetOf(c),
      best_set_previous: bestSetOf(p),
    });
  }

  return comparisons.sort((a, b) => {
    if (a.driver === "dropped" && b.driver !== "dropped") return 1;
    if (b.driver === "dropped" && a.driver !== "dropped") return -1;
    return b.volume_kg.current - a.volume_kg.current;
  });
}

export interface AggregateComparison {
  workouts: MetricDelta;
  hard_sets: MetricDelta;
  total_reps: MetricDelta;
  volume_kg: MetricDelta;
  /** Mean of each comparable exercise's own e1RM % change. Averaging the
   * PERCENTAGES (not the kilos) is the only way to combine a 140 kg squat
   * with a 12 kg lateral raise into one "am I getting stronger" number — the
   * same reasoning as `progressionIndex` in metrics.ts. Null when nothing was
   * trained in both windows. */
  mean_e1rm_pct_change: number | null;
  /** How many exercises that mean is over — a +12% across two lifts is a very
   * different claim from +12% across eleven, and the model must be able to
   * say which it has. */
  exercises_compared: number;
  exercises_improved: number;
  exercises_declined: number;
  exercises_new: number;
  exercises_dropped: number;
}

function sumSets(sets: DatedExerciseSetWithWorkout[]) {
  let hardSets = 0;
  let reps = 0;
  let volume = 0;
  const workouts = new Set<string>();
  for (const set of sets) {
    if (!isWorkingSet(set)) continue;
    hardSets += 1;
    reps += set.reps ?? 0;
    volume += (set.weight_kg ?? 0) * (set.reps ?? 0);
    workouts.add(set.workout_id);
  }
  return { hardSets, reps, volume, workouts: workouts.size };
}

/** Window-level totals plus the mean strength move across everything trained
 * in both windows. Takes the already-computed `comparisons` so the per-
 * exercise and aggregate views can never disagree about which exercises were
 * comparable. */
export function aggregateComparison(
  previousSets: DatedExerciseSetWithWorkout[],
  currentSets: DatedExerciseSetWithWorkout[],
  comparisons: ExerciseComparison[],
): AggregateComparison {
  const p = sumSets(previousSets);
  const c = sumSets(currentSets);

  const comparable = comparisons.filter(
    (x) => x.driver !== "new" && x.driver !== "dropped" && x.best_e1rm.pct_change != null,
  );
  const meanE1rm =
    comparable.length > 0
      ? round2(
          comparable.reduce((sum, x) => sum + (x.best_e1rm.pct_change ?? 0), 0) / comparable.length,
        )
      : null;

  return {
    workouts: metricDelta(p.workouts, c.workouts),
    hard_sets: metricDelta(p.hardSets, c.hardSets),
    total_reps: metricDelta(p.reps, c.reps),
    volume_kg: metricDelta(p.volume, c.volume),
    mean_e1rm_pct_change: meanE1rm,
    exercises_compared: comparable.length,
    exercises_improved: comparable.filter(
      (x) => (x.best_e1rm.pct_change ?? 0) >= STRENGTH_NOISE_PCT,
    ).length,
    exercises_declined: comparable.filter(
      (x) => (x.best_e1rm.pct_change ?? 0) <= -STRENGTH_NOISE_PCT,
    ).length,
    exercises_new: comparisons.filter((x) => x.driver === "new").length,
    exercises_dropped: comparisons.filter((x) => x.driver === "dropped").length,
  };
}

// --- muscle-scoped selection + attribution ---------------------------------

export type MuscleRole = "primary" | "secondary";

/** How much of a set's work is credited to a muscle it trains: all of it when
 * that muscle is the primary mover, half when it's a secondary. Same 1.0/0.5
 * split `muscleLoadWeighted` (metrics.ts) already uses for the dashboard
 * heatmap, so the bot's "bicep volume" and the heatmap's agree. */
const SECONDARY_CREDIT = 0.5;

export function muscleRoleFor(
  template: MuscleTemplateInfo | undefined,
  groups: readonly string[],
): MuscleRole | null {
  if (!template) return null;
  if (template.primary_muscle_group && groups.includes(template.primary_muscle_group)) {
    return "primary";
  }
  const secondary = template.secondary_muscle_groups ?? [];
  return secondary.some((muscle) => groups.includes(muscle)) ? "secondary" : null;
}

/** Every set that trains any of `groups`, as either a primary or a secondary
 * mover. Returns the sets themselves (not an aggregate) so the caller can run
 * the full comparison machinery over a muscle-scoped slice — that's what
 * makes "how have my biceps improved" answerable with the same per-exercise
 * detail as a single-lift question. */
export function setsTrainingMuscles(
  sets: DatedExerciseSetWithWorkout[],
  templates: Map<string, MuscleTemplateInfo>,
  groups: readonly HevyMuscleGroup[],
): DatedExerciseSetWithWorkout[] {
  return sets.filter((set) => {
    const template = set.exercise_template_id ? templates.get(set.exercise_template_id) : undefined;
    return muscleRoleFor(template, groups) != null;
  });
}

export interface MuscleLoad {
  /** Volume with secondary movers credited at half — "how much work did this
   * muscle actually absorb", not "how much was lifted in exercises that touch
   * it". */
  attributed_volume_kg: number;
  attributed_hard_sets: number;
  /** Unweighted totals over the same set list, for when the raw number is
   * what's wanted (e.g. "my curls moved 4,200 lb"). */
  raw_volume_kg: number;
  raw_hard_sets: number;
  total_reps: number;
  /** Distinct workouts in which this muscle was trained at all. */
  sessions: number;
  direct_exercises: number;
  indirect_exercises: number;
}

export function muscleLoad(
  sets: DatedExerciseSetWithWorkout[],
  templates: Map<string, MuscleTemplateInfo>,
  groups: readonly HevyMuscleGroup[],
): MuscleLoad {
  let attributedVolume = 0;
  let attributedSets = 0;
  let rawVolume = 0;
  let rawSets = 0;
  let reps = 0;
  const workouts = new Set<string>();
  const direct = new Set<string>();
  const indirect = new Set<string>();

  for (const set of sets) {
    if (!isWorkingSet(set)) continue;
    const template = set.exercise_template_id ? templates.get(set.exercise_template_id) : undefined;
    const role = muscleRoleFor(template, groups);
    if (!role) continue;

    const credit = role === "primary" ? 1 : SECONDARY_CREDIT;
    const volume = (set.weight_kg ?? 0) * (set.reps ?? 0);
    attributedVolume += volume * credit;
    attributedSets += credit;
    rawVolume += volume;
    rawSets += 1;
    reps += set.reps ?? 0;
    workouts.add(set.workout_id);
    (role === "primary" ? direct : indirect).add(exerciseKey(set));
  }

  return {
    attributed_volume_kg: round2(attributedVolume),
    attributed_hard_sets: round2(attributedSets),
    raw_volume_kg: round2(rawVolume),
    raw_hard_sets: rawSets,
    total_reps: reps,
    sessions: workouts.size,
    direct_exercises: direct.size,
    indirect_exercises: indirect.size,
  };
}

// --- within-window trend (first session vs latest) -------------------------

export interface ExerciseTrend {
  exercise_template_id: string | null;
  exercise_title: string;
  primary_muscle_group: string | null;
  /** Whether this exercise trains the muscle being asked about directly or as
   * a secondary mover. Undefined for non-muscle-scoped callers. */
  role?: MuscleRole;
  sessions: number;
  hard_sets: number;
  total_reps: number;
  total_volume_kg: number;
  first_session: SessionPoint;
  last_session: SessionPoint;
  best_session: SessionPoint;
  /** Latest session vs the first one in the window. */
  e1rm_pct_change: number | null;
  top_weight_pct_change: number | null;
  session_volume_pct_change: number | null;
  /** e1RM % change divided by the number of session-to-session gaps — a
   * comparable "rate" across exercises trained at different frequencies. */
  pct_change_per_session: number | null;
  driver: ProgressDriver;
}

/** Sessions an exercise needs in the window before a trend is reported — one
 * session is a single point, and a single point has no direction. Matches
 * `MIN_SESSIONS_FOR_PROGRESSION` in metrics.ts. */
const MIN_SESSIONS_FOR_TREND = 2;

/** Per-exercise progression WITHIN one window: first logged session vs the
 * latest. This is what "how have my biceps improved?" actually asks — not
 * "this week vs last week" but "across the stretch I'm asking about, where
 * did each lift start and where did it end up". Exercises with a single
 * session in the window are excluded (see `MIN_SESSIONS_FOR_TREND`); the
 * caller should report them separately rather than pretend they were flat.
 * Sorted by e1RM % change descending, so the biggest movers lead. */
export function exerciseTrends(
  sets: DatedExerciseSetWithWorkout[],
  muscleGroupByTemplateId: Map<string, string | null>,
): { trends: ExerciseTrend[]; single_session_exercises: string[] } {
  const trends: ExerciseTrend[] = [];
  const singleSession: string[] = [];

  for (const stats of statsByExercise(sets).values()) {
    const { first_session: first, last_session: last, best_session: best } = stats;
    if (!first || !last || !best) continue;
    if (stats.sessions < MIN_SESSIONS_FOR_TREND || first.workout_id === last.workout_id) {
      singleSession.push(stats.exercise_title);
      continue;
    }

    const e1rmPct = pctChange(exactE1RM(first), exactE1RM(last));
    const volumePct = pctChange(first.session_volume_kg, last.session_volume_kg);
    const gaps = stats.sessions - 1;
    const templateId = stats.exercise_template_id;

    trends.push({
      exercise_template_id: templateId,
      exercise_title: stats.exercise_title,
      primary_muscle_group: templateId ? (muscleGroupByTemplateId.get(templateId) ?? null) : null,
      sessions: stats.sessions,
      hard_sets: stats.hard_sets,
      total_reps: stats.total_reps,
      total_volume_kg: stats.volume_kg,
      first_session: first,
      last_session: last,
      best_session: best,
      e1rm_pct_change: e1rmPct,
      top_weight_pct_change: pctChange(first.weight_kg, last.weight_kg),
      session_volume_pct_change: volumePct,
      pct_change_per_session: e1rmPct != null && gaps > 0 ? round2(e1rmPct / gaps) : null,
      driver: classifyDriver({ e1rm_pct: e1rmPct, volume_pct: volumePct }),
    });
  }

  trends.sort((a, b) => (b.e1rm_pct_change ?? 0) - (a.e1rm_pct_change ?? 0));
  return { trends, single_session_exercises: singleSession.sort() };
}

/** Mean of the per-exercise e1RM % changes — the one headline number for
 * "did this muscle get stronger over the window". Same percentage-averaging
 * rationale as `AggregateComparison.mean_e1rm_pct_change`; weights direct
 * (primary-mover) exercises fully and indirect ones at half, so a bicep
 * verdict isn't dominated by what the rows did. */
export function meanTrendPctChange(trends: ExerciseTrend[]): number | null {
  let weightedSum = 0;
  let weight = 0;
  for (const trend of trends) {
    if (trend.e1rm_pct_change == null) continue;
    const w = trend.role === "secondary" ? SECONDARY_CREDIT : 1;
    weightedSum += trend.e1rm_pct_change * w;
    weight += w;
  }
  return weight > 0 ? round2(weightedSum / weight) : null;
}
