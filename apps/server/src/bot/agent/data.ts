// Read-only data access for the Q&A tools. Every function takes userId first
// and filters on it — the service role bypasses RLS.

import type { DatedExerciseSetWithWorkout, MuscleTemplateInfo } from "@liftledger/shared";
import { db, must } from "../../lib/db";

export interface TemplateInfo extends MuscleTemplateInfo {
  id: string;
  title: string;
}

async function paged<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await page(from, from + 999);
    if (r.error) throw new Error(r.error.message);
    out.push(...(r.data ?? []));
    if (!r.data || r.data.length < 1000) return out;
  }
}

export async function loadTemplates(userId: string): Promise<Map<string, TemplateInfo>> {
  const rows = await paged((from, to) =>
    db
      .from("exercise_templates")
      .select("id, title, primary_muscle_group, secondary_muscle_groups")
      .eq("user_id", userId)
      .order("id")
      .range(from, to),
  );
  return new Map(rows.map((r) => [r.id, r]));
}

export interface WorkoutInfo {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string | null;
}

/** Workouts (newest first) and their sets since `sinceIso` (all time if null). */
export async function loadTraining(
  userId: string,
  sinceIso: string | null,
  untilIso: string | null = null,
): Promise<{ workouts: WorkoutInfo[]; sets: DatedExerciseSetWithWorkout[] }> {
  const workouts = await paged<WorkoutInfo>((from, to) => {
    let q = db
      .from("workouts")
      .select("id, title, start_time, end_time")
      .eq("user_id", userId)
      .order("start_time", { ascending: false })
      .range(from, to);
    if (sinceIso) q = q.gte("start_time", sinceIso);
    if (untilIso) q = q.lt("start_time", untilIso);
    return q;
  });
  const startById = new Map(workouts.map((w) => [w.id, w.start_time]));
  const sets: DatedExerciseSetWithWorkout[] = [];
  const ids = workouts.map((w) => w.id);
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    const rows = await paged((from, to) =>
      db
        .from("workout_sets")
        .select(
          "workout_id, exercise_template_id, exercise_title, exercise_index, set_index, set_type, weight_kg, reps, rpe, duration_seconds, distance_meters",
        )
        .eq("user_id", userId)
        .in("workout_id", chunk)
        .order("id")
        .range(from, to),
    );
    for (const r of rows) {
      const start = startById.get(r.workout_id);
      if (start) sets.push({ ...r, workout_start_time: start });
    }
  }
  return { workouts, sets };
}

export async function loadBodyweight(userId: string, fromDate: string | null) {
  let q = db
    .from("body_measurements")
    .select("date, source, weight_kg, fat_percent")
    .eq("user_id", userId)
    .not("weight_kg", "is", null)
    .order("date", { ascending: true });
  if (fromDate) q = q.gte("date", fromDate);
  return must(await q);
}

export async function loadMeals(userId: string, fromDate: string, toDate: string) {
  return paged((from, to) =>
    db
      .from("meals")
      .select(
        "id, local_date, eaten_at, title, calories, protein_g, carbs_g, fat_g, fiber_g, meal_items(name, brand, quantity, unit, calories, protein_g, match_source)",
      )
      .eq("user_id", userId)
      .gte("local_date", fromDate)
      .lte("local_date", toDate)
      .order("eaten_at", { ascending: true })
      .range(from, to),
  );
}

export async function loadGoals(userId: string) {
  return must(
    await db
      .from("nutrition_goals")
      .select(
        "effective_from, preset, calories, protein_g, carbs_g, fat_g, protein_g_per_lb, rationale",
      )
      .eq("user_id", userId)
      .order("effective_from", { ascending: false }),
  );
}

export async function loadHealth(userId: string, fromDate: string, toDate: string) {
  return must(
    await db
      .from("health_daily")
      .select("date, metric, value")
      .eq("user_id", userId)
      .gte("date", fromDate)
      .lte("date", toDate)
      .order("date", { ascending: true }),
  );
}
