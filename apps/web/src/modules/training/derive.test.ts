// Characterization tests (REFACTOR_PLAN.md Phase 0): lock in current
// behavior of gym/derive.ts before Phase 6/7/8 touch anything nearby.
import type { DatedExerciseSetWithWorkout, MuscleTemplateInfo, PREvent } from "@liftledger/shared";
import { describe, expect, it } from "vitest";
import {
  type TemplateRow,
  type WeeklyVolumePoint,
  type WorkoutRow,
  bestPRPerWorkout,
  cardioTotals,
  hasCardioSets,
  muscleBreakdown,
  muscleLastTrained,
  summarizeWorkouts,
  templateMuscleMap,
  volumeDeltaLabel,
  weeklySessionStreak,
  weeklyVolumeSeries,
} from "./derive";
import type { SetWithWorkoutMeta } from "./queries";

function set(overrides: Partial<DatedExerciseSetWithWorkout> = {}): DatedExerciseSetWithWorkout {
  return {
    workout_id: "w1",
    exercise_template_id: "t1",
    exercise_title: "Bench Press",
    set_type: "normal",
    weight_kg: 100,
    reps: 5,
    rpe: null,
    duration_seconds: null,
    distance_meters: null,
    workout_start_time: "2026-07-15T10:00:00Z",
    ...overrides,
  };
}

describe("weeklyVolumeSeries", () => {
  it("buckets sets into continuous weeks with zero-fill", () => {
    const sets = [set({ workout_start_time: "2026-07-15T10:00:00Z", weight_kg: 100, reps: 5 })];
    const muscleMap = new Map<string, string | null>([["t1", "chest"]]);
    const { points, muscles } = weeklyVolumeSeries(sets, muscleMap, 3, new Date(2026, 6, 17));
    expect(points.map((p) => p.week_start)).toEqual(["2026-06-29", "2026-07-06", "2026-07-13"]);
    expect(muscles).toEqual(["chest"]);
    const currentWeek = points.at(-1);
    expect(currentWeek?.total).toBe(500);
    expect(currentWeek?.byMuscle).toEqual({ chest: 500 });
    expect(currentWeek?.sessionCount).toBe(1);
    expect(points[0]?.total).toBe(0);
  });

  it("skips warmup sets via shared volume math", () => {
    const sets = [set({ set_type: "warmup" })];
    const muscleMap = new Map<string, string | null>([["t1", "chest"]]);
    const { points } = weeklyVolumeSeries(sets, muscleMap, 1, new Date(2026, 6, 17));
    expect(points[0]?.total).toBe(0);
  });
});

describe("volumeDeltaLabel", () => {
  it("reports no volume yet when both weeks are zero", () => {
    expect(volumeDeltaLabel(0, 0)).toEqual({ text: "no volume yet", positive: true });
  });

  it("reports unchanged when equal", () => {
    expect(volumeDeltaLabel(500, 500)).toEqual({ text: "same as last week", positive: true });
  });

  it("reports a positive delta in the default (lb) unit", () => {
    expect(volumeDeltaLabel(600, 500)).toEqual({ text: "+220 lb vs last week", positive: true });
  });

  it("reports a negative delta in the default (lb) unit", () => {
    expect(volumeDeltaLabel(400, 500)).toEqual({ text: "−220 lb vs last week", positive: false });
  });
});

describe("summarizeWorkouts", () => {
  it("groups sets by workout and exercise in index order", () => {
    const workouts: WorkoutRow[] = [
      {
        id: "w1",
        user_id: "u1",
        title: "Push Day",
        description: null,
        start_time: "2026-07-15T10:00:00Z",
        end_time: "2026-07-15T11:00:00Z",
        hevy_updated_at: null,
        raw: {},
        synced_at: "2026-07-15T11:05:00Z",
      },
    ];
    const sets: SetWithWorkoutMeta[] = [
      {
        id: 2,
        workout_id: "w1",
        exercise_template_id: "t1",
        exercise_title: "Bench Press",
        exercise_index: 0,
        set_index: 1,
        set_type: "normal",
        weight_kg: 100,
        reps: 5,
        rpe: null,
        duration_seconds: null,
        distance_meters: null,
        workout_start_time: "2026-07-15T10:00:00Z",
      },
      {
        id: 1,
        workout_id: "w1",
        exercise_template_id: "t1",
        exercise_title: "Bench Press",
        exercise_index: 0,
        set_index: 0,
        set_type: "normal",
        weight_kg: 90,
        reps: 5,
        rpe: null,
        duration_seconds: null,
        distance_meters: null,
        workout_start_time: "2026-07-15T10:00:00Z",
      },
    ];
    const summaries = summarizeWorkouts(workouts, sets);
    expect(summaries).toHaveLength(1);
    const summary = summaries[0];
    expect(summary?.set_count).toBe(2);
    expect(summary?.exercise_count).toBe(1);
    expect(summary?.exercises[0]?.sets.map((s) => s.set_index)).toEqual([0, 1]);
    expect(summary?.total_volume_kg).toBe(90 * 5 + 100 * 5);
  });
});

describe("bestPRPerWorkout", () => {
  it("keeps only the highest e1RM per workout+exercise", () => {
    const prs: PREvent[] = [
      {
        workout_id: "w1",
        exercise_template_id: "t1",
        exercise_title: "Bench",
        e1rm: 100,
      } as PREvent,
      {
        workout_id: "w1",
        exercise_template_id: "t1",
        exercise_title: "Bench",
        e1rm: 120,
      } as PREvent,
      {
        workout_id: "w2",
        exercise_template_id: "t1",
        exercise_title: "Bench",
        e1rm: 90,
      } as PREvent,
    ];
    const result = bestPRPerWorkout(prs);
    expect(result).toHaveLength(2);
    expect(result.find((p) => p.workout_id === "w1")?.e1rm).toBe(120);
  });
});

describe("templateMuscleMap / muscleLastTrained", () => {
  it("finds the most recent workout per muscle group, ignoring warmups", () => {
    const templates = templateMuscleMap([
      {
        id: "t1",
        title: "Bench",
        type: null,
        primary_muscle_group: "chest",
        secondary_muscle_groups: ["triceps"],
        is_custom: false,
        equipment: null,
        synced_at: "2026-07-01T00:00:00Z",
        user_id: "u1",
      } as TemplateRow,
    ]);
    const sets: DatedExerciseSetWithWorkout[] = [
      set({ workout_start_time: "2026-07-01T00:00:00Z" }),
      set({ workout_start_time: "2026-07-10T00:00:00Z", set_type: "warmup" }),
      set({ workout_start_time: "2026-07-05T00:00:00Z" }),
    ];
    const result = muscleLastTrained(sets, templates);
    expect(result.chest).toBe("2026-07-05T00:00:00Z");
    expect(result.triceps).toBe("2026-07-05T00:00:00Z");
  });
});

describe("muscleBreakdown", () => {
  it("separates primary vs secondary and tracks the heaviest set", () => {
    const templates = new Map<string, MuscleTemplateInfo>([
      ["t1", { primary_muscle_group: "chest", secondary_muscle_groups: ["triceps"] }],
    ]);
    const sets = [set({ weight_kg: 100, reps: 5 }), set({ weight_kg: 110, reps: 3 })];
    const chest = muscleBreakdown(sets, templates, "chest");
    expect(chest.sessions).toBe(1);
    expect(chest.exercises[0]?.isSecondary).toBe(false);
    expect(chest.exercises[0]?.sets).toBe(2);

    const triceps = muscleBreakdown(sets, templates, "triceps");
    expect(triceps.exercises[0]?.isSecondary).toBe(true);
  });
});

describe("weeklySessionStreak", () => {
  it("counts back from the most recent week, excusing an in-progress current week", () => {
    const points: WeeklyVolumePoint[] = [
      { week_start: "2026-06-29", total: 100, byMuscle: {}, sessionCount: 1 },
      { week_start: "2026-07-06", total: 100, byMuscle: {}, sessionCount: 1 },
      { week_start: "2026-07-13", total: 0, byMuscle: {}, sessionCount: 0 },
    ];
    expect(weeklySessionStreak(points)).toBe(2);
  });

  it("breaks the streak on a past empty week", () => {
    const points: WeeklyVolumePoint[] = [
      { week_start: "2026-06-29", total: 0, byMuscle: {}, sessionCount: 0 },
      { week_start: "2026-07-06", total: 100, byMuscle: {}, sessionCount: 1 },
    ];
    expect(weeklySessionStreak(points)).toBe(1);
  });
});

describe("cardioTotals / hasCardioSets", () => {
  it("sums duration/distance for the current week only", () => {
    const sets = [
      set({
        workout_start_time: "2026-07-15T00:00:00Z",
        duration_seconds: 600,
        distance_meters: 2000,
      }),
      set({
        workout_start_time: "2026-06-01T00:00:00Z",
        duration_seconds: 600,
        distance_meters: 2000,
      }),
      set({
        workout_start_time: "2026-07-16T00:00:00Z",
        duration_seconds: null,
        distance_meters: null,
      }),
    ];
    const totals = cardioTotals(sets, new Date(2026, 6, 17));
    expect(totals.durationSeconds).toBe(600);
    expect(totals.distanceMeters).toBe(2000);
    expect(totals.sessionCount).toBe(1);
  });

  it("hasCardioSets is true only when a cardio field is populated anywhere", () => {
    expect(hasCardioSets([set()])).toBe(false);
    expect(hasCardioSets([set({ duration_seconds: 60 })])).toBe(true);
  });
});
