import { describe, expect, it } from "vitest";
import {
  bestE1RMPerExercise,
  bestSetPerWorkout,
  bmrMifflinStJeor,
  computeTargets,
  detectPRs,
  epley1RM,
  movementPatternFor,
  muscleLoadWeighted,
  progressionIndex,
  scaleTargetsToCalories,
  setVolume,
  tdee,
  topE1RMChanges,
  volumeByMuscleGroup,
  weightTrend,
} from "./metrics.js";

describe("bmrMifflinStJeor", () => {
  it("computes BMR for a male", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(bmrMifflinStJeor({ weightKg: 80, heightCm: 180, age: 30, sex: "male" })).toBe(1780);
  });

  it("computes BMR for a female", () => {
    // 10*65 + 6.25*165 - 5*28 - 161 = 650 + 1031.25 - 140 - 161 = 1380.25
    expect(bmrMifflinStJeor({ weightKg: 65, heightCm: 165, age: 28, sex: "female" })).toBeCloseTo(
      1380.25,
      5,
    );
  });
});

describe("tdee", () => {
  it("applies the moderate activity multiplier", () => {
    // 1780 * 1.55 = 2759
    expect(tdee(1780, "moderate")).toBeCloseTo(2759, 5);
  });

  it("applies the sedentary activity multiplier", () => {
    expect(tdee(1780, "sedentary")).toBeCloseTo(1780 * 1.2, 5);
  });

  it("applies the very_active activity multiplier", () => {
    expect(tdee(1780, "very_active")).toBeCloseTo(1780 * 1.9, 5);
  });
});

describe("computeTargets", () => {
  const baseProfile = {
    weight_kg: 80,
    height_cm: 180,
    birth_date: "1994-06-15",
    sex: "male" as const,
    activity_level: "moderate" as const,
  };
  const now = new Date("2024-06-15T12:00:00Z");

  it("computes a cut proposal with the default midpoint rate", () => {
    // BMR = 1780, TDEE = 2759, default cut rate -0.375 kg/wk
    // dailyDelta = -0.375 * 7700 / 7 = -412.5 => calories = round(2759 - 412.5) = 2347
    const result = computeTargets({ profile: baseProfile, goal: "cut", now });
    expect(result.calories).toBe(2347);
    expect(result.protein_g).toBe(160); // 2.0 g/kg * 80
    expect(result.fat_g).toBe(64); // 0.8 g/kg * 80
    // carbsKcal = 2347 - 160*4 - 64*9 = 2347 - 640 - 576 = 1131 => carbs_g = round(1131/4) = 283
    expect(result.carbs_g).toBe(283);
    expect(result.rationale).toContain("2759");
    expect(result.rationale).toContain("deficit");
  });

  it("computes maintain with zero delta", () => {
    const result = computeTargets({ profile: baseProfile, goal: "maintain", now });
    expect(result.calories).toBe(2759);
    expect(result.rationale).toContain("maintain");
  });

  it("computes bulk with a surplus", () => {
    const result = computeTargets({ profile: baseProfile, goal: "bulk", now });
    // dailyDelta = 0.25 * 7700 / 7 = 275 => calories = round(2759 + 275) = 3034
    expect(result.calories).toBe(3034);
    expect(result.rationale).toContain("surplus");
  });

  it("honors an explicit rateKgPerWeek override", () => {
    const result = computeTargets({ profile: baseProfile, goal: "cut", rateKgPerWeek: -0.5, now });
    // dailyDelta = -0.5 * 7700 / 7 = -550 => calories = round(2759 - 550) = 2209
    expect(result.calories).toBe(2209);
  });

  it("throws a clear error when the profile is incomplete", () => {
    expect(() =>
      computeTargets({
        profile: { ...baseProfile, height_cm: null },
        goal: "cut",
        now,
      }),
    ).toThrow(/height_cm/);
  });

  it("points at Hevy, not profile.update, when bodyweight is the missing piece", () => {
    expect(() =>
      computeTargets({
        profile: { ...baseProfile, weight_kg: null },
        goal: "cut",
        now,
      }),
    ).toThrow(/Hevy/);
  });
});

describe("scaleTargetsToCalories", () => {
  const current = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 };

  it("scales macros up preserving the ratio (nutrition example flow #1)", () => {
    // ratio = 2500/2000 = 1.25 => protein 187.5->188, carbs 250, fat 75
    const result = scaleTargetsToCalories(current, 2500);
    expect(result).toEqual({ calories: 2500, protein_g: 188, carbs_g: 250, fat_g: 75 });
  });

  it("scales macros down preserving the ratio", () => {
    // ratio = 1000/2000 = 0.5 => protein 75, carbs 100, fat 30
    const result = scaleTargetsToCalories(current, 1000);
    expect(result).toEqual({ calories: 1000, protein_g: 75, carbs_g: 100, fat_g: 30 });
  });

  it("is a no-op when the calorie target is unchanged", () => {
    const result = scaleTargetsToCalories(current, 2000);
    expect(result).toEqual(current);
  });

  it("rounds sensibly rather than truncating", () => {
    // ratio = 2200/2000 = 1.1 => protein 165, carbs 220, fat 66 (all exact)
    const result = scaleTargetsToCalories(current, 2200);
    expect(result).toEqual({ calories: 2200, protein_g: 165, carbs_g: 220, fat_g: 66 });
  });

  it("throws for a non-positive current calorie baseline", () => {
    expect(() => scaleTargetsToCalories({ ...current, calories: 0 }, 2000)).toThrow(/positive/);
  });
});

describe("setVolume", () => {
  it("sums weight x reps, skipping warmups", () => {
    const sets = [
      { weight_kg: 100, reps: 5, set_type: "normal" },
      { weight_kg: 50, reps: 10, set_type: "warmup" },
      { weight_kg: 80, reps: 8, set_type: "normal" },
    ];
    // 100*5 + 80*8 = 500 + 640 = 1140 (warmup skipped)
    expect(setVolume(sets)).toBe(1140);
  });

  it("treats null weight/reps as zero", () => {
    expect(setVolume([{ weight_kg: null, reps: null, set_type: "failure" }])).toBe(0);
  });

  it("returns 0 for an empty set list", () => {
    expect(setVolume([])).toBe(0);
  });
});

describe("epley1RM", () => {
  it("computes estimated 1RM", () => {
    // 100 * (1 + 5/30) = 116.666...
    expect(epley1RM(100, 5)).toBeCloseTo(116.6667, 3);
  });

  it("returns the weight itself for a 1-rep set", () => {
    expect(epley1RM(100, 1)).toBeCloseTo(100 * (1 + 1 / 30), 5);
  });
});

describe("volumeByMuscleGroup", () => {
  const templates = new Map<string, string | null>([
    ["bench-id", "chest"],
    ["row-id", "upper_back"],
    ["mystery-id", null],
  ]);

  it("sums volume per muscle group, skipping warmups", () => {
    const sets = [
      { exercise_template_id: "bench-id", weight_kg: 100, reps: 5, set_type: "normal" }, // 500
      { exercise_template_id: "bench-id", weight_kg: 40, reps: 10, set_type: "warmup" }, // skipped
      { exercise_template_id: "row-id", weight_kg: 60, reps: 8, set_type: "normal" }, // 480
      { exercise_template_id: "row-id", weight_kg: 60, reps: 8, set_type: "normal" }, // 480
    ];
    expect(volumeByMuscleGroup(sets, templates)).toEqual({ chest: 500, upper_back: 960 });
  });

  it("buckets unknown templates and null muscle groups under 'other'", () => {
    const sets = [
      { exercise_template_id: "mystery-id", weight_kg: 20, reps: 10, set_type: "normal" }, // 200
      { exercise_template_id: "unregistered-id", weight_kg: 10, reps: 10, set_type: "normal" }, // 100
      { exercise_template_id: null, weight_kg: 5, reps: 5, set_type: "normal" }, // 25
    ];
    expect(volumeByMuscleGroup(sets, templates)).toEqual({ other: 325 });
  });

  it("returns an empty object for no sets", () => {
    expect(volumeByMuscleGroup([], templates)).toEqual({});
  });
});

describe("muscleLoadWeighted", () => {
  const templates = new Map([
    [
      "bench-id",
      { primary_muscle_group: "chest", secondary_muscle_groups: ["triceps", "shoulders"] },
    ],
    ["row-id", { primary_muscle_group: "upper_back", secondary_muscle_groups: ["biceps"] }],
    ["mystery-id", { primary_muscle_group: null, secondary_muscle_groups: [] }],
  ]);

  it("credits the primary muscle at 1.0x and each secondary at 0.5x, in hard-set-count mode", () => {
    const sets = [
      { exercise_template_id: "bench-id", weight_kg: 100, reps: 5, set_type: "normal" },
      { exercise_template_id: "bench-id", weight_kg: 100, reps: 5, set_type: "normal" },
    ];
    // A 2-set bench-press session: chest gets 2 full sets, triceps and
    // shoulders (secondary) each get half of that — the plan's own
    // "bench-press session credits triceps at half its set count" check.
    expect(muscleLoadWeighted(sets, templates, "sets")).toEqual({
      chest: 2,
      triceps: 1,
      shoulders: 1,
    });
  });

  it("skips warmup sets", () => {
    const sets = [
      { exercise_template_id: "bench-id", weight_kg: 100, reps: 5, set_type: "normal" },
      { exercise_template_id: "bench-id", weight_kg: 40, reps: 10, set_type: "warmup" },
    ];
    expect(muscleLoadWeighted(sets, templates, "sets")).toEqual({
      chest: 1,
      triceps: 0.5,
      shoulders: 0.5,
    });
  });

  it("weights volume (weight_kg x reps) the same 1.0/0.5x way in volume mode", () => {
    const sets = [{ exercise_template_id: "row-id", weight_kg: 60, reps: 8, set_type: "normal" }]; // 480 volume
    expect(muscleLoadWeighted(sets, templates, "volume")).toEqual({
      upper_back: 480,
      biceps: 240,
    });
  });

  it("buckets unknown templates and templates with no muscle groups under 'other'", () => {
    const sets = [
      { exercise_template_id: "mystery-id", weight_kg: 20, reps: 10, set_type: "normal" },
      { exercise_template_id: "unregistered-id", weight_kg: 10, reps: 10, set_type: "normal" },
      { exercise_template_id: null, weight_kg: 5, reps: 5, set_type: "normal" },
    ];
    expect(muscleLoadWeighted(sets, templates, "sets")).toEqual({ other: 3 });
  });

  it("counts a hard set even when weight_kg is null (bodyweight exercises stay visible)", () => {
    const sets = [
      { exercise_template_id: "bench-id", weight_kg: null, reps: 12, set_type: "normal" },
    ];
    expect(muscleLoadWeighted(sets, templates, "sets")).toEqual({
      chest: 1,
      triceps: 0.5,
      shoulders: 0.5,
    });
  });

  it("returns an empty object for no sets", () => {
    expect(muscleLoadWeighted([], templates, "sets")).toEqual({});
  });
});

describe("bestE1RMPerExercise", () => {
  it("keeps only the max e1RM per exercise, grouped by template id", () => {
    const sets = [
      {
        exercise_template_id: "bench-id",
        exercise_title: "Bench Press",
        weight_kg: 100,
        reps: 5,
        workout_start_time: "2026-01-01T00:00:00Z",
      }, // e1RM = 100*(1+5/30) = 116.6667
      {
        exercise_template_id: "bench-id",
        exercise_title: "Bench Press",
        weight_kg: 90,
        reps: 8,
        workout_start_time: "2026-01-08T00:00:00Z",
      }, // e1RM = 90*(1+8/30) = 114
      {
        exercise_template_id: "bench-id",
        exercise_title: "Bench Press",
        weight_kg: 40,
        reps: 10,
        set_type: "warmup",
        workout_start_time: "2026-01-08T00:00:00Z",
      }, // skipped (warmup) — would otherwise be irrelevant anyway
    ];
    const best = bestE1RMPerExercise(sets);
    expect(best.size).toBe(1);
    expect(best.get("bench-id")?.e1rm).toBeCloseTo(116.6667, 3);
  });

  it("falls back to exercise_title for sets with no template id", () => {
    const sets = [
      {
        exercise_template_id: null,
        exercise_title: "Custom Move",
        weight_kg: 50,
        reps: 10,
        workout_start_time: "2026-01-01T00:00:00Z",
      },
    ];
    const best = bestE1RMPerExercise(sets);
    expect(best.get("title:Custom Move")?.e1rm).toBeCloseTo(50 * (1 + 10 / 30), 5);
  });

  it("ignores sets missing weight or reps", () => {
    const sets = [
      {
        exercise_template_id: "bw-id",
        exercise_title: "Pull Up",
        weight_kg: null,
        reps: 10,
        workout_start_time: "2026-01-01T00:00:00Z",
      },
    ];
    expect(bestE1RMPerExercise(sets).size).toBe(0);
  });
});

describe("bestSetPerWorkout", () => {
  it("picks the max-e1RM non-warmup set per workout and sorts chronologically", () => {
    const sets = [
      // w2 (later date) listed first to prove sorting doesn't rely on input order
      {
        exercise_template_id: "bench-id",
        exercise_title: "Bench Press",
        workout_id: "w2",
        weight_kg: 100,
        reps: 5, // e1RM 116.667
        workout_start_time: "2026-02-01T00:00:00Z",
      },
      {
        exercise_template_id: "bench-id",
        exercise_title: "Bench Press",
        workout_id: "w2",
        weight_kg: 40,
        reps: 12,
        set_type: "warmup", // must be ignored despite being logged after
        workout_start_time: "2026-02-01T00:00:00Z",
      },
      {
        exercise_template_id: "bench-id",
        exercise_title: "Bench Press",
        workout_id: "w1",
        weight_kg: 80,
        reps: 5, // e1RM 93.333
        workout_start_time: "2026-01-01T00:00:00Z",
      },
      {
        exercise_template_id: "bench-id",
        exercise_title: "Bench Press",
        workout_id: "w1",
        weight_kg: 85,
        reps: 3, // e1RM 93.5 — the actual best set of w1
        workout_start_time: "2026-01-01T00:00:00Z",
      },
    ];

    const result = bestSetPerWorkout(sets);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ workout_id: "w1", weight_kg: 85, reps: 3 });
    expect(result[0]?.e1rm).toBeCloseTo(93.5, 2);
    expect(result[1]).toMatchObject({ workout_id: "w2", weight_kg: 100, reps: 5 });
    expect(result[1]?.e1rm).toBeCloseTo(116.67, 2);
  });

  it("returns an empty array when every set is a warmup or missing weight/reps", () => {
    const sets = [
      {
        exercise_template_id: "x",
        exercise_title: "X",
        workout_id: "w1",
        weight_kg: 50,
        reps: 5,
        set_type: "warmup",
        workout_start_time: "2026-01-01T00:00:00Z",
      },
      {
        exercise_template_id: "x",
        exercise_title: "X",
        workout_id: "w1",
        weight_kg: null,
        reps: 8,
        workout_start_time: "2026-01-01T00:00:00Z",
      },
    ];
    expect(bestSetPerWorkout(sets)).toEqual([]);
  });

  it("carries the rpe of the best set through, when present", () => {
    const sets = [
      {
        exercise_template_id: "x",
        exercise_title: "X",
        workout_id: "w1",
        weight_kg: 80,
        reps: 5,
        rpe: 7,
        workout_start_time: "2026-01-01T00:00:00Z",
      },
      {
        exercise_template_id: "x",
        exercise_title: "X",
        workout_id: "w1",
        weight_kg: 85,
        reps: 5, // higher e1RM — becomes the best set, carrying its own rpe
        rpe: 9,
        workout_start_time: "2026-01-01T00:00:00Z",
      },
    ];
    expect(bestSetPerWorkout(sets)[0]).toMatchObject({ weight_kg: 85, rpe: 9 });
  });

  it("omits rpe (rather than defaulting to null) when the input sets don't carry it at all", () => {
    const sets = [
      {
        exercise_template_id: "x",
        exercise_title: "X",
        workout_id: "w1",
        weight_kg: 80,
        reps: 5,
        workout_start_time: "2026-01-01T00:00:00Z",
      },
    ];
    expect(bestSetPerWorkout(sets)).toEqual([
      {
        workout_id: "w1",
        workout_start_time: "2026-01-01T00:00:00Z",
        weight_kg: 80,
        reps: 5,
        e1rm: 93.33,
      },
    ]);
  });
});

describe("topE1RMChanges", () => {
  it("ranks exercises by e1RM delta across the period boundary", () => {
    const periodStart = "2026-02-01T00:00:00Z";
    const sets = [
      // Bench: 100kgx5 (116.667) before -> 110kgx5 (128.333) in period: delta ~11.667
      {
        exercise_template_id: "bench-id",
        exercise_title: "Bench Press",
        weight_kg: 100,
        reps: 5,
        workout_start_time: "2026-01-01T00:00:00Z",
      },
      {
        exercise_template_id: "bench-id",
        exercise_title: "Bench Press",
        weight_kg: 110,
        reps: 5,
        workout_start_time: "2026-02-10T00:00:00Z",
      },
      // Squat: no prior data (before=0), 140kgx5 (163.333) in period: delta = 163.333
      {
        exercise_template_id: "squat-id",
        exercise_title: "Squat",
        weight_kg: 140,
        reps: 5,
        workout_start_time: "2026-02-15T00:00:00Z",
      },
      // Row: 60kgx8 (76) before, nothing in period -> excluded entirely
      {
        exercise_template_id: "row-id",
        exercise_title: "Row",
        weight_kg: 60,
        reps: 8,
        workout_start_time: "2026-01-05T00:00:00Z",
      },
    ];

    const changes = topE1RMChanges(sets, periodStart);
    expect(changes).toHaveLength(2);
    // Squat's delta (163.33) beats bench's (~11.67) despite having no history.
    expect(changes[0]).toMatchObject({ exercise_template_id: "squat-id", e1rm_before: 0 });
    expect(changes[0]?.delta).toBeCloseTo(163.33, 1);
    expect(changes[1]).toMatchObject({ exercise_template_id: "bench-id" });
    expect(changes[1]?.delta).toBeCloseTo(11.67, 1);
  });

  it("respects topN", () => {
    const periodStart = "2026-02-01T00:00:00Z";
    const sets = ["a", "b", "c"].map((id) => ({
      exercise_template_id: id,
      exercise_title: id,
      weight_kg: 50,
      reps: 5,
      workout_start_time: "2026-02-10T00:00:00Z",
    }));
    expect(topE1RMChanges(sets, periodStart, 2)).toHaveLength(2);
  });

  it("returns an empty array when nothing happened in the period", () => {
    const sets = [
      {
        exercise_template_id: "bench-id",
        exercise_title: "Bench Press",
        weight_kg: 100,
        reps: 5,
        workout_start_time: "2026-01-01T00:00:00Z",
      },
    ];
    expect(topE1RMChanges(sets, "2026-02-01T00:00:00Z")).toEqual([]);
  });
});

describe("detectPRs", () => {
  it("flags a chronological sequence of all-time e1RM maxes, skipping non-improvements", () => {
    const sets = [
      // Bench 100x5 (116.667) -> PR (previous_best 0)
      {
        exercise_template_id: "bench-id",
        exercise_title: "Bench Press",
        workout_id: "w1",
        weight_kg: 100,
        reps: 5,
        workout_start_time: "2026-01-01T00:00:00Z",
      },
      // Bench 90x5 (105) -> NOT a PR (below 116.667)
      {
        exercise_template_id: "bench-id",
        exercise_title: "Bench Press",
        workout_id: "w2",
        weight_kg: 90,
        reps: 5,
        workout_start_time: "2026-01-08T00:00:00Z",
      },
      // Bench 110x5 (128.333) -> PR
      {
        exercise_template_id: "bench-id",
        exercise_title: "Bench Press",
        workout_id: "w3",
        weight_kg: 110,
        reps: 5,
        workout_start_time: "2026-01-15T00:00:00Z",
      },
      // Warmup set with a huge weight must not count as a PR
      {
        exercise_template_id: "bench-id",
        exercise_title: "Bench Press",
        workout_id: "w4",
        weight_kg: 200,
        reps: 5,
        set_type: "warmup",
        workout_start_time: "2026-01-22T00:00:00Z",
      },
    ];

    const prs = detectPRs(sets);
    expect(prs).toHaveLength(2);
    expect(prs[0]).toMatchObject({ workout_id: "w1", previous_best_e1rm: 0 });
    expect(prs[0]?.e1rm).toBeCloseTo(116.67, 2);
    expect(prs[1]).toMatchObject({ workout_id: "w3" });
    expect(prs[1]?.previous_best_e1rm).toBeCloseTo(116.67, 2);
    expect(prs[1]?.e1rm).toBeCloseTo(128.33, 2);
  });

  it("sorts out-of-order input chronologically before scanning", () => {
    const sets = [
      {
        exercise_template_id: "sq-id",
        exercise_title: "Squat",
        workout_id: "late",
        weight_kg: 150,
        reps: 3,
        workout_start_time: "2026-03-01T00:00:00Z",
      },
      {
        exercise_template_id: "sq-id",
        exercise_title: "Squat",
        workout_id: "early",
        weight_kg: 100,
        reps: 3,
        workout_start_time: "2026-01-01T00:00:00Z",
      },
    ];
    const prs = detectPRs(sets);
    expect(prs.map((p) => p.workout_id)).toEqual(["early", "late"]);
  });

  it("ignores sets missing weight or reps (e.g. bodyweight-reps-only movements)", () => {
    const sets = [
      {
        exercise_template_id: "pu-id",
        exercise_title: "Pull Up",
        workout_id: "w1",
        weight_kg: null,
        reps: 10,
        workout_start_time: "2026-01-01T00:00:00Z",
      },
    ];
    expect(detectPRs(sets)).toEqual([]);
  });
});

describe("weightTrend", () => {
  function dateOf(day: number): string {
    // day 0 -> 2026-01-01, day 20 -> 2026-01-21, etc.
    const d = new Date(Date.UTC(2026, 0, 1 + day));
    return d.toISOString().slice(0, 10);
  }

  it("returns null for no entries", () => {
    expect(weightTrend([], null)).toBeNull();
  });

  it("handles a single entry: latest/avg equal it, zero rate, one point", () => {
    const result = weightTrend([{ date: dateOf(0), weight_kg: 80 }], null);
    expect(result).toEqual({
      latest_kg: 80,
      rolling_avg_kg: 80,
      rate_kg_per_week: 0,
      entry_count: 1,
      points: [{ date: dateOf(0), weight_kg: 80, rolling_avg_kg: 80 }],
    });
  });

  it("smooths a single-day spike via the 7-day rolling average", () => {
    // 6 days flat at 80kg, then a 7th day spikes to 84kg (e.g. a heavy,
    // salty meal the night before a weigh-in).
    const entries = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      date: dateOf(day),
      weight_kg: day === 6 ? 84 : 80,
    }));
    const result = weightTrend(entries, null);
    // Day 6's window is all 7 days: (6*80 + 84) / 7 = 80.571... -> 80.57.
    expect(result?.rolling_avg_kg).toBeCloseTo(80.57, 2);
    // The raw latest weight still reports the actual (unsmoothed) value.
    expect(result?.latest_kg).toBe(84);
  });

  it("computes rate_kg_per_week on the smoothed series over the given period", () => {
    // 21 days, losing exactly 0.1kg/day from 82.0 to 80.0 — a perfectly
    // linear series, so once the 7-day window is fully "warmed up" (day
    // index >= 6), the rolling average is itself linear with the identical
    // slope, just shifted 3 days earlier: smoothed(i) = 82.0 - 0.1*(i-3).
    const entries = Array.from({ length: 21 }, (_, i) => ({
      date: dateOf(i),
      weight_kg: Math.round((82 - 0.1 * i) * 10) / 10,
    }));
    // period=10 keeps both endpoints (day 10 and day 20) inside the
    // warmed-up region, so the shift cancels and the rate comes out exactly
    // -0.1kg/day = -0.7kg/week.
    const result = weightTrend(entries, 10);
    expect(result?.latest_kg).toBeCloseTo(80.0, 5);
    expect(result?.rolling_avg_kg).toBeCloseTo(82 - 0.1 * (20 - 3), 5); // 80.3
    expect(result?.rate_kg_per_week).toBeCloseTo(-0.7, 5);
    expect(result?.entry_count).toBe(21);
    expect(result?.points).toHaveLength(11); // days 10..20 inclusive
  });

  it("does not require entries to be pre-sorted", () => {
    const sorted = weightTrend(
      [
        { date: dateOf(0), weight_kg: 80 },
        { date: dateOf(1), weight_kg: 81 },
      ],
      null,
    );
    const shuffled = weightTrend(
      [
        { date: dateOf(1), weight_kg: 81 },
        { date: dateOf(0), weight_kg: 80 },
      ],
      null,
    );
    expect(shuffled).toEqual(sorted);
  });
});

describe("movementPatternFor", () => {
  it("maps Hevy muscle groups to push/pull/legs/core", () => {
    expect(movementPatternFor("chest")).toBe("push");
    expect(movementPatternFor("triceps")).toBe("push");
    expect(movementPatternFor("lats")).toBe("pull");
    expect(movementPatternFor("biceps")).toBe("pull");
    // Posterior-chain pulls (deadlift, back extension) are what load it.
    expect(movementPatternFor("lower_back")).toBe("pull");
    expect(movementPatternFor("quadriceps")).toBe("legs");
    expect(movementPatternFor("abdominals")).toBe("core");
  });

  it("returns null for groups that map to no pattern", () => {
    expect(movementPatternFor("cardio")).toBeNull();
    expect(movementPatternFor("full_body")).toBeNull();
    expect(movementPatternFor("neck")).toBeNull();
    expect(movementPatternFor(null)).toBeNull();
    expect(movementPatternFor(undefined)).toBeNull();
  });
});

describe("progressionIndex", () => {
  // Chest press (push) on w1/w3, squat (legs) on w2/w4 — deliberately
  // interleaved on different days so the carry-forward behaviour is visible.
  const press = (workout_id: string, workout_start_time: string, weight_kg: number) => ({
    exercise_template_id: "press-id",
    exercise_title: "Chest Press",
    workout_id,
    workout_start_time,
    weight_kg,
    reps: 5,
  });
  const squat = (workout_id: string, workout_start_time: string, weight_kg: number) => ({
    exercise_template_id: "squat-id",
    exercise_title: "Squat",
    workout_id,
    workout_start_time,
    weight_kg,
    reps: 5,
  });
  const muscleMap = new Map<string, string | null>([
    ["press-id", "chest"],
    ["squat-id", "quadriceps"],
  ]);

  const sets = [
    press("w1", "2026-01-01T00:00:00Z", 100), // e1RM 116.67 — press baseline
    squat("w2", "2026-01-08T00:00:00Z", 100), // e1RM 116.67 — squat baseline
    press("w3", "2026-01-15T00:00:00Z", 110), // e1RM 128.33 — +10%
    squat("w4", "2026-01-22T00:00:00Z", 120), // e1RM 140.00 — +20%
  ];

  it("averages each exercise's % change against its own baseline, holding it between sessions", () => {
    const { points } = progressionIndex(sets, muscleMap, null);

    expect(points).toEqual([
      // Only the press has started; squat's line hasn't begun.
      { time: "2026-01-01T00:00:00Z", all: 0, push: 0, pull: null, legs: null, core: null },
      { time: "2026-01-08T00:00:00Z", all: 0, push: 0, pull: null, legs: 0, core: null },
      // Press jumps to +10%; squat holds its baseline, so "all" is the mean.
      { time: "2026-01-15T00:00:00Z", all: 5, push: 10, pull: null, legs: 0, core: null },
      { time: "2026-01-22T00:00:00Z", all: 15, push: 10, pull: null, legs: 20, core: null },
    ]);
  });

  it("counts the exercises feeding each series", () => {
    expect(progressionIndex(sets, muscleMap, null).exercise_counts).toEqual({
      all: 2,
      push: 1,
      pull: 0,
      legs: 1,
      core: 0,
    });
  });

  it("ignores exercises trained only once in the window", () => {
    // A one-session curl is a flat 0% line: it says nothing about progress
    // and would only drag "all" (and invent a pull line) toward zero.
    const withCurl = [
      ...sets,
      {
        exercise_template_id: "curl-id",
        exercise_title: "Bicep Curl",
        workout_id: "w4",
        workout_start_time: "2026-01-22T00:00:00Z",
        weight_kg: 20,
        reps: 10,
      },
    ];
    const result = progressionIndex(withCurl, new Map([...muscleMap, ["curl-id", "biceps"]]), null);

    expect(result.exercise_counts).toEqual({ all: 2, push: 1, pull: 0, legs: 1, core: 0 });
    expect(result.points.at(-1)).toEqual({
      time: "2026-01-22T00:00:00Z",
      all: 15,
      push: 10,
      pull: null,
      legs: 20,
      core: null,
    });
  });

  it("measures progress within the window, taking baselines from inside it", () => {
    // periodStart lands between each exercise's two sessions, leaving one
    // session each — nothing has two sessions in-window, so nothing tracks.
    expect(progressionIndex(sets, muscleMap, "2026-01-10T00:00:00Z").points).toEqual([]);

    // A window containing both press sessions but neither squat baseline:
    // "all" is the press alone, and its baseline is the in-window session.
    const wide = [...sets, press("w5", "2026-02-01T00:00:00Z", 120)]; // e1RM 140
    const { points, exercise_counts } = progressionIndex(wide, muscleMap, "2026-01-10T00:00:00Z");

    expect(exercise_counts).toEqual({ all: 1, push: 1, pull: 0, legs: 0, core: 0 });
    expect(points).toEqual([
      { time: "2026-01-15T00:00:00Z", all: 0, push: 0, pull: null, legs: null, core: null },
      // 140 vs the in-window baseline of 128.33 (not the pre-window 116.67).
      { time: "2026-02-01T00:00:00Z", all: 9.09, push: 9.09, pull: null, legs: null, core: null },
    ]);
  });

  it("counts an unmapped or template-less exercise toward 'all' but gives it no pattern line", () => {
    const withUntagged = [
      ...sets,
      {
        ...press("w1", "2026-01-01T00:00:00Z", 50),
        exercise_template_id: null,
        exercise_title: "Sled Push",
      },
      {
        ...press("w3", "2026-01-15T00:00:00Z", 100),
        exercise_template_id: null,
        exercise_title: "Sled Push",
      },
    ];
    const result = progressionIndex(withUntagged, muscleMap, null);

    expect(result.exercise_counts).toEqual({ all: 3, push: 1, pull: 0, legs: 1, core: 0 });
    // Sled Push doubled (+100%), so "all" carries it while "push" doesn't.
    expect(result.points.at(-1)).toEqual({
      time: "2026-01-22T00:00:00Z",
      all: 43.33,
      push: 10,
      pull: null,
      legs: 20,
      core: null,
    });
  });

  it("returns no points when there's no trackable history", () => {
    expect(progressionIndex([], muscleMap, null)).toEqual({
      points: [],
      exercise_counts: { all: 0, push: 0, pull: 0, legs: 0, core: 0 },
    });
  });
});
