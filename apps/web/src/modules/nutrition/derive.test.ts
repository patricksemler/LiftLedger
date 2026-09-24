import { describe, expect, it } from "vitest";
import {
  type GoalRow,
  type MealRow,
  adherenceSummary,
  dailyTotals,
  dayVerdict,
  goalOn,
  ratioOf,
  sumMeals,
  topFoods,
  weeklyAverages,
} from "./derive";

function item(name: string, calories: number, protein_g = 0): MealRow["meal_items"][number] {
  return {
    id: `${name}-${calories}`,
    meal_id: "m",
    user_id: "u",
    position: 0,
    name,
    brand: null,
    quantity: null,
    unit: null,
    grams: null,
    calories,
    protein_g,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    match_source: "user",
    match_ref: null,
    created_at: "2026-09-01T00:00:00Z",
  };
}

function meal(local_date: string, items: MealRow["meal_items"]): MealRow {
  const calories = items.reduce((a, i) => a + i.calories, 0);
  const protein_g = items.reduce((a, i) => a + i.protein_g, 0);
  return {
    id: `${local_date}-${calories}`,
    user_id: "u",
    eaten_at: `${local_date}T12:00:00Z`,
    local_date,
    title: items.map((i) => i.name).join(", "),
    source: "dashboard",
    confidence: null,
    calories,
    protein_g,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    raw_text: null,
    parse: null,
    created_at: "",
    updated_at: "",
    meal_items: items,
  };
}

function goal(effective_from: string, calories: number, protein_g = 150): GoalRow {
  return {
    id: effective_from,
    user_id: "u",
    effective_from,
    preset: "custom",
    calories,
    protein_g,
    carbs_g: 0,
    fat_g: 0,
    protein_g_per_lb: null,
    rationale: null,
    created_at: "",
  };
}

describe("sumMeals / ratioOf", () => {
  it("sums and rounds", () => {
    expect(sumMeals([meal("2026-09-01", [item("a", 100.4, 10.6)])])).toMatchObject({
      calories: 100,
      protein_g: 11,
    });
  });
  it("treats a missing target as 0", () => {
    expect(ratioOf(500, null)).toBe(0);
    expect(ratioOf(500, 1000)).toBe(0.5);
  });
});

describe("goalOn", () => {
  it("picks the latest goal effective on or before the date", () => {
    const goals = [goal("2026-09-10", 2500), goal("2026-09-01", 2000)];
    expect(goalOn(goals, "2026-09-05")?.calories).toBe(2000);
    expect(goalOn(goals, "2026-09-10")?.calories).toBe(2500);
    expect(goalOn(goals, "2026-08-31")).toBeNull();
  });
});

describe("dailyTotals + adherence", () => {
  const goals = [goal("2026-09-01", 2000, 150)];
  const meals = [
    meal("2026-09-01", [item("oats", 2000, 160)]),
    meal("2026-09-02", [item("pizza", 3000, 90)]),
  ];
  const points = dailyTotals(meals, goals, "2026-09-01", "2026-09-03");

  it("zero-fills gaps and attaches the goal of the day", () => {
    expect(points.map((p) => p.calories)).toEqual([2000, 3000, 0]);
    expect(points[2]?.goalCalories).toBe(2000);
  });

  it("scores days, ignoring unlogged ones", () => {
    expect(points.map((p) => dayVerdict(p))).toEqual(["hit", "over", "none"]);
    expect(adherenceSummary(points)).toMatchObject({
      loggedDays: 2,
      hitDays: 1,
      overDays: 1,
      proteinHitDays: 1,
      avgCalories: 2500,
    });
  });
});

describe("topFoods", () => {
  it("groups by name case-insensitively and ranks by calories", () => {
    const meals = [
      meal("2026-09-01", [item("Granola", 240), item("milk", 120)]),
      meal("2026-09-02", [item("granola", 240)]),
    ];
    const top = topFoods(meals);
    expect(top[0]).toMatchObject({ name: "Granola", count: 2, calories: 480 });
    expect(top[0]?.shareOfCalories).toBeCloseTo(0.8);
  });
});

describe("weeklyAverages", () => {
  it("buckets logged days into Mon-start weeks", () => {
    const goals: GoalRow[] = [];
    const meals = [
      meal("2026-09-07", [item("a", 2000)]), // Mon
      meal("2026-09-08", [item("a", 3000)]),
      meal("2026-09-14", [item("a", 1000)]), // next Mon
    ];
    const points = dailyTotals(meals, goals, "2026-09-07", "2026-09-14");
    expect(weeklyAverages(points)).toEqual([
      { weekStart: "2026-09-07", avgCalories: 2500 },
      { weekStart: "2026-09-14", avgCalories: 1000 },
    ]);
  });
});
