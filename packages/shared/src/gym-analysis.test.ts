import { describe, expect, it } from "vitest";
import {
  aggregateComparison,
  classifyDriver,
  compareExercises,
  exerciseTrends,
  formatPct,
  meanTrendPctChange,
  metricDelta,
  muscleLoad,
  pctChange,
  setsTrainingMuscles,
  statsByExercise,
} from "./gym-analysis.js";
import type { DatedExerciseSetWithWorkout, MuscleTemplateInfo } from "./metrics.js";

/** Terse set builder — every test here cares about weight/reps/workout and
 * nothing else. */
function set(
  workoutId: string,
  time: string,
  title: string,
  weight: number | null,
  reps: number | null,
  extra: Partial<DatedExerciseSetWithWorkout> = {},
): DatedExerciseSetWithWorkout {
  return {
    exercise_template_id: `tpl-${title}`,
    exercise_title: title,
    weight_kg: weight,
    reps,
    set_type: "normal",
    workout_id: workoutId,
    workout_start_time: time,
    ...extra,
  };
}

describe("pctChange / metricDelta", () => {
  it("computes a percentage change", () => {
    expect(pctChange(100, 110)).toBe(10);
    expect(pctChange(110, 100)).toBe(-9.09);
  });

  it("returns null rather than 0 or Infinity when there is no baseline", () => {
    expect(pctChange(0, 50)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
  });

  it("packages current/previous/delta/pct together", () => {
    expect(metricDelta(200, 250)).toEqual({
      current: 250,
      previous: 200,
      delta: 50,
      pct_change: 25,
    });
  });

  it("formats percentages with a real minus sign, and null as n/a", () => {
    expect(formatPct(8.34)).toBe("+8.3%");
    expect(formatPct(-4)).toBe("−4%");
    expect(formatPct(0)).toBe("0%");
    expect(formatPct(null)).toBe("n/a");
  });
});

describe("statsByExercise", () => {
  const sets = [
    set("w1", "2026-01-01T10:00:00Z", "Curl", 20, 10),
    set("w1", "2026-01-01T10:00:00Z", "Curl", 20, 8),
    set("w1", "2026-01-01T10:00:00Z", "Curl", 10, 15, { set_type: "warmup" }),
    set("w2", "2026-01-08T10:00:00Z", "Curl", 22.5, 10),
  ];

  it("aggregates sessions, hard sets, reps and volume, skipping warmups", () => {
    const curl = statsByExercise(sets).get("tpl-Curl");
    expect(curl).toBeDefined();
    expect(curl?.sessions).toBe(2);
    expect(curl?.hard_sets).toBe(3);
    expect(curl?.total_reps).toBe(28);
    // 20*10 + 20*8 + 22.5*10 — the 10 kg warmup is excluded.
    expect(curl?.volume_kg).toBe(585);
  });

  it("derives mean load per rep, which separates heavier from more", () => {
    const curl = statsByExercise(sets).get("tpl-Curl");
    expect(curl?.avg_weight_kg).toBe(20.89); // 585 / 28
    expect(curl?.avg_reps_per_set).toBe(9.33);
  });

  it("anchors the first, latest and best session of the window", () => {
    const curl = statsByExercise(sets).get("tpl-Curl");
    expect(curl?.first_session?.workout_id).toBe("w1");
    expect(curl?.last_session?.workout_id).toBe("w2");
    expect(curl?.best_session?.workout_id).toBe("w2");
    // The session's best set is the max-e1RM one: 20x10 beats 20x8.
    expect(curl?.first_session?.reps).toBe(10);
    expect(curl?.first_session?.session_volume_kg).toBe(360);
  });

  it("keeps unscoreable sets in the volume/frequency totals but not the trend", () => {
    const stats = statsByExercise([
      set("w1", "2026-01-01T10:00:00Z", "Plank", null, null),
      set("w2", "2026-01-02T10:00:00Z", "Plank", null, null),
    ]).get("tpl-Plank");
    expect(stats?.sessions).toBe(2);
    expect(stats?.hard_sets).toBe(2);
    expect(stats?.best_e1rm).toBe(0);
    expect(stats?.first_session).toBeNull();
  });
});

describe("classifyDriver", () => {
  it("separates a strength gain from a volume gain", () => {
    expect(classifyDriver({ e1rm_pct: 6, volume_pct: 1 })).toBe("strength");
    expect(classifyDriver({ e1rm_pct: 0.5, volume_pct: 22 })).toBe("volume");
    expect(classifyDriver({ e1rm_pct: 6, volume_pct: 22 })).toBe("both");
  });

  it("calls out volume that came purely from training more often", () => {
    expect(
      classifyDriver({
        e1rm_pct: 0,
        volume_pct: 50,
        sessions_pct: 100,
        volume_per_session_pct: 0,
      }),
    ).toBe("frequency");
  });

  it("treats sub-noise movement as maintained, not progress", () => {
    expect(classifyDriver({ e1rm_pct: 1, volume_pct: 3 })).toBe("maintained");
    expect(classifyDriver({ e1rm_pct: -1, volume_pct: -3 })).toBe("maintained");
  });

  it("reports a genuine two-way decline as a regression", () => {
    expect(classifyDriver({ e1rm_pct: -5, volume_pct: -20 })).toBe("regression");
  });
});

describe("compareExercises", () => {
  const muscleMap = new Map<string, string | null>([
    ["tpl-Curl", "biceps"],
    ["tpl-Bench", "chest"],
    ["tpl-Row", "upper_back"],
  ]);

  const previous = [
    set("p1", "2026-01-01T10:00:00Z", "Curl", 20, 10),
    set("p1", "2026-01-01T10:00:00Z", "Bench", 80, 5),
    set("p1", "2026-01-01T10:00:00Z", "Row", 60, 10),
  ];
  const current = [
    set("c1", "2026-01-08T10:00:00Z", "Curl", 22, 10),
    set("c1", "2026-01-08T10:00:00Z", "Curl", 22, 10),
    set("c1", "2026-01-08T10:00:00Z", "Bench", 80, 5),
  ];

  it("reports percentage changes per exercise", () => {
    const byTitle = new Map(
      compareExercises(previous, current, muscleMap).map((c) => [c.exercise_title, c]),
    );
    const curl = byTitle.get("Curl");
    expect(curl?.best_e1rm.pct_change).toBe(10); // 22/20 at the same reps
    expect(curl?.volume_kg.pct_change).toBe(120); // 200 -> 440
    expect(curl?.driver).toBe("both");
    expect(curl?.primary_muscle_group).toBe("biceps");
  });

  it("marks an exercise trained in neither window's counterpart", () => {
    const byTitle = new Map(
      compareExercises(previous, current, muscleMap).map((c) => [c.exercise_title, c]),
    );
    expect(byTitle.get("Row")?.driver).toBe("dropped");
    expect(byTitle.get("Bench")?.driver).toBe("maintained");
  });

  it("keeps a brand-new exercise as `new` rather than an infinite gain", () => {
    const comparisons = compareExercises([], current, muscleMap);
    expect(comparisons.every((c) => c.driver === "new")).toBe(true);
    expect(comparisons[0]?.volume_kg.pct_change).toBeNull();
  });

  it("sorts by current volume, with dropped exercises last", () => {
    const order = compareExercises(previous, current, muscleMap).map((c) => c.exercise_title);
    expect(order).toEqual(["Curl", "Bench", "Row"]);
  });
});

describe("aggregateComparison", () => {
  const muscleMap = new Map<string, string | null>();
  const previous = [
    set("p1", "2026-01-01T10:00:00Z", "Curl", 20, 10),
    set("p1", "2026-01-01T10:00:00Z", "Squat", 100, 5),
  ];
  const current = [
    set("c1", "2026-01-08T10:00:00Z", "Curl", 24, 10),
    set("c1", "2026-01-08T10:00:00Z", "Squat", 100, 5),
  ];

  it("averages PERCENTAGES so a heavy lift can't drown out a light one", () => {
    const comparisons = compareExercises(previous, current, muscleMap);
    const totals = aggregateComparison(previous, current, comparisons);
    // Curl +20%, Squat 0% -> mean +10%. Averaging kilos would have given +2.
    expect(totals.mean_e1rm_pct_change).toBe(10);
    expect(totals.exercises_compared).toBe(2);
    expect(totals.exercises_improved).toBe(1);
    expect(totals.exercises_declined).toBe(0);
  });

  it("counts workouts, sets and reps across the whole window", () => {
    const totals = aggregateComparison(previous, current, []);
    expect(totals.workouts).toEqual({ current: 1, previous: 1, delta: 0, pct_change: 0 });
    expect(totals.hard_sets.current).toBe(2);
    expect(totals.volume_kg.current).toBe(740);
  });

  it("has no strength verdict when nothing was trained in both windows", () => {
    const comparisons = compareExercises([], current, new Map());
    expect(aggregateComparison([], current, comparisons).mean_e1rm_pct_change).toBeNull();
  });
});

describe("muscle attribution", () => {
  const templates = new Map<string, MuscleTemplateInfo>([
    ["tpl-Curl", { primary_muscle_group: "biceps", secondary_muscle_groups: ["forearms"] }],
    ["tpl-Row", { primary_muscle_group: "upper_back", secondary_muscle_groups: ["biceps"] }],
    ["tpl-Squat", { primary_muscle_group: "quadriceps", secondary_muscle_groups: ["glutes"] }],
  ]);
  const sets = [
    set("w1", "2026-01-01T10:00:00Z", "Curl", 20, 10),
    set("w1", "2026-01-01T10:00:00Z", "Row", 60, 10),
    set("w1", "2026-01-01T10:00:00Z", "Squat", 100, 5),
  ];

  it("selects exercises that train a muscle directly OR as a secondary mover", () => {
    const titles = setsTrainingMuscles(sets, templates, ["biceps"]).map((s) => s.exercise_title);
    expect(titles).toEqual(["Curl", "Row"]);
  });

  it("credits a secondary mover at half weight", () => {
    const load = muscleLoad(sets, templates, ["biceps"]);
    expect(load.raw_volume_kg).toBe(800); // 200 curl + 600 row
    expect(load.attributed_volume_kg).toBe(500); // 200 + 600*0.5
    expect(load.attributed_hard_sets).toBe(1.5);
    expect(load.direct_exercises).toBe(1);
    expect(load.indirect_exercises).toBe(1);
    expect(load.sessions).toBe(1);
  });

  it("resolves composite groups by union", () => {
    const titles = setsTrainingMuscles(sets, templates, ["biceps", "quadriceps"]).map(
      (s) => s.exercise_title,
    );
    expect(titles).toEqual(["Curl", "Row", "Squat"]);
  });
});

describe("exerciseTrends", () => {
  const sets = [
    set("w1", "2026-01-01T10:00:00Z", "Curl", 20, 10),
    set("w2", "2026-01-08T10:00:00Z", "Curl", 22, 10),
    set("w3", "2026-01-15T10:00:00Z", "Curl", 24, 10),
    set("w1", "2026-01-01T10:00:00Z", "Fly", 15, 12),
  ];

  it("measures the window's first session against its latest", () => {
    const { trends } = exerciseTrends(sets, new Map([["tpl-Curl", "biceps"]]));
    const curl = trends.find((t) => t.exercise_title === "Curl");
    expect(curl?.sessions).toBe(3);
    expect(curl?.e1rm_pct_change).toBe(20); // 20 kg -> 24 kg at the same reps
    expect(curl?.top_weight_pct_change).toBe(20);
    expect(curl?.pct_change_per_session).toBe(10); // 20% over two gaps
    expect(curl?.driver).toBe("both");
    expect(curl?.primary_muscle_group).toBe("biceps");
  });

  it("holds back single-session exercises instead of calling them flat", () => {
    const { trends, single_session_exercises } = exerciseTrends(sets, new Map());
    expect(trends.map((t) => t.exercise_title)).toEqual(["Curl"]);
    expect(single_session_exercises).toEqual(["Fly"]);
  });

  it("weights indirect exercises at half in the headline mean", () => {
    const { trends } = exerciseTrends(sets, new Map());
    const curl = trends[0];
    expect(curl).toBeDefined();
    if (!curl) return;
    // One direct at +20% and one indirect at 0% -> (20*1 + 0*0.5) / 1.5.
    const withIndirect = [
      { ...curl, role: "primary" as const },
      { ...curl, role: "secondary" as const, e1rm_pct_change: 0 },
    ];
    expect(meanTrendPctChange(withIndirect)).toBe(13.33);
  });
});
