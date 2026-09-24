// Pure mapping from Hevy payloads to LiftLedger rows.

import type { TablesInsert } from "@liftledger/shared";
import type { HevyTemplate, HevyWorkout } from "./client";

export function workoutRow(userId: string, w: HevyWorkout): TablesInsert<"workouts"> {
  return {
    user_id: userId,
    id: w.id,
    title: w.title,
    description: w.description,
    start_time: w.start_time,
    end_time: w.end_time,
    hevy_updated_at: w.updated_at,
    // biome-ignore lint/suspicious/noExplicitAny: raw payload kept for future fields
    raw: w as any,
    synced_at: new Date().toISOString(),
  };
}

export function setRows(userId: string, w: HevyWorkout): TablesInsert<"workout_sets">[] {
  return w.exercises.flatMap((ex) =>
    ex.sets.map((s) => ({
      user_id: userId,
      workout_id: w.id,
      exercise_template_id: ex.exercise_template_id,
      exercise_title: ex.title,
      exercise_index: ex.index,
      set_index: s.index,
      set_type: s.type,
      weight_kg: s.weight_kg,
      reps: s.reps,
      rpe: s.rpe,
      duration_seconds: s.duration_seconds,
      distance_meters: s.distance_meters,
    })),
  );
}

export function templateRow(userId: string, t: HevyTemplate): TablesInsert<"exercise_templates"> {
  return {
    user_id: userId,
    id: t.id,
    title: t.title,
    type: t.type,
    primary_muscle_group: t.primary_muscle_group,
    secondary_muscle_groups: t.secondary_muscle_groups ?? [],
    equipment: t.equipment ?? null,
    is_custom: t.is_custom,
    synced_at: new Date().toISOString(),
  };
}

/** Template ids referenced by these workouts that aren't in `known`. */
export function unknownTemplateIds(workouts: HevyWorkout[], known: Set<string>): string[] {
  const missing = new Set<string>();
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (ex.exercise_template_id && !known.has(ex.exercise_template_id)) {
        missing.add(ex.exercise_template_id);
      }
    }
  }
  return [...missing];
}
