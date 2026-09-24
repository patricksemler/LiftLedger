// Pure view-model helpers for the nutrition module: turning meal/goal rows
// into what the today panel, charts, adherence calendar and top-foods table
// render. No Supabase, no React.

import { type Tables, addLocalDays } from "@liftledger/shared";

export type MealItemRow = Tables<"meal_items">;
export type MealRow = Tables<"meals"> & { meal_items: MealItemRow[] };
export type GoalRow = Tables<"nutrition_goals">;

export interface Totals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

const ZERO_TOTALS: Totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

export function sumMeals(meals: Pick<MealRow, keyof Totals>[]): Totals {
  const t = meals.reduce<Totals>(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein_g: acc.protein_g + m.protein_g,
      carbs_g: acc.carbs_g + m.carbs_g,
      fat_g: acc.fat_g + m.fat_g,
    }),
    { ...ZERO_TOTALS },
  );
  return {
    calories: Math.round(t.calories),
    protein_g: Math.round(t.protein_g),
    carbs_g: Math.round(t.carbs_g),
    fat_g: Math.round(t.fat_g),
  };
}

/** Consumed/target ratio, 0 when there's no positive target to divide by
 * (so a not-yet-set target never renders as "over"). */
export function ratioOf(consumed: number, target: number | null | undefined): number {
  if (!target || target <= 0) return 0;
  return consumed / target;
}

/** The goal in effect on `date`: latest effective_from <= date. `goals` may
 * be in any order. */
export function goalOn(goals: GoalRow[], date: string): GoalRow | null {
  let best: GoalRow | null = null;
  for (const g of goals) {
    if (g.effective_from <= date && (!best || g.effective_from > best.effective_from)) best = g;
  }
  return best;
}

export interface DailyPoint extends Totals {
  date: string;
  mealCount: number;
  goalCalories: number | null;
  goalProtein: number | null;
}

/** One point per calendar date in `[fromDate, toDate]`, gaps zero-filled so
 * charts show a continuous x-axis. Bucketed by the meal's stored local_date. */
export function dailyTotals(
  meals: MealRow[],
  goals: GoalRow[],
  fromDate: string,
  toDate: string,
): DailyPoint[] {
  const byDate = new Map<string, MealRow[]>();
  for (const meal of meals) {
    const list = byDate.get(meal.local_date) ?? [];
    list.push(meal);
    byDate.set(meal.local_date, list);
  }
  const points: DailyPoint[] = [];
  for (let d = fromDate; d <= toDate; d = addLocalDays(d, 1)) {
    const dayMeals = byDate.get(d) ?? [];
    const goal = goalOn(goals, d);
    points.push({
      date: d,
      ...sumMeals(dayMeals),
      mealCount: dayMeals.length,
      goalCalories: goal?.calories ?? null,
      goalProtein: goal?.protein_g ?? null,
    });
  }
  return points;
}

export type DayVerdict = "hit" | "over" | "under" | "none";

/** Calorie goal counts as hit within ±10%; days with nothing logged are
 * "none" (unknown), not "under" — an unlogged day isn't a fasting day. */
export function dayVerdict(point: DailyPoint, tolerance = 0.1): DayVerdict {
  if (point.mealCount === 0 || !point.goalCalories) return "none";
  const r = point.calories / point.goalCalories;
  if (r > 1 + tolerance) return "over";
  if (r < 1 - tolerance) return "under";
  return "hit";
}

export interface AdherenceSummary {
  loggedDays: number;
  hitDays: number;
  overDays: number;
  underDays: number;
  proteinHitDays: number;
  avgCalories: number | null;
  avgProtein: number | null;
}

export function adherenceSummary(points: DailyPoint[]): AdherenceSummary {
  const logged = points.filter((p) => p.mealCount > 0);
  const verdicts = logged.map((p) => dayVerdict(p));
  const avg = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  return {
    loggedDays: logged.length,
    hitDays: verdicts.filter((v) => v === "hit").length,
    overDays: verdicts.filter((v) => v === "over").length,
    underDays: verdicts.filter((v) => v === "under").length,
    proteinHitDays: logged.filter((p) => p.goalProtein && p.protein_g >= p.goalProtein * 0.95)
      .length,
    avgCalories: avg(logged.map((p) => p.calories)),
    avgProtein: avg(logged.map((p) => p.protein_g)),
  };
}

export interface FoodAggregate {
  name: string;
  count: number;
  calories: number;
  protein_g: number;
  shareOfCalories: number;
}

/** Items grouped by case-insensitive name, sorted by total calories. */
export function topFoods(meals: MealRow[], limit = 10): FoodAggregate[] {
  const byName = new Map<string, FoodAggregate>();
  let total = 0;
  for (const meal of meals) {
    for (const item of meal.meal_items) {
      const key = item.name.trim().toLowerCase();
      const agg = byName.get(key) ?? {
        name: item.name.trim(),
        count: 0,
        calories: 0,
        protein_g: 0,
        shareOfCalories: 0,
      };
      agg.count += 1;
      agg.calories += item.calories;
      agg.protein_g += item.protein_g;
      byName.set(key, agg);
      total += item.calories;
    }
  }
  return [...byName.values()]
    .map((a) => ({
      ...a,
      calories: Math.round(a.calories),
      protein_g: Math.round(a.protein_g),
      shareOfCalories: total > 0 ? a.calories / total : 0,
    }))
    .sort((a, b) => b.calories - a.calories)
    .slice(0, limit);
}

/** Mean of each full Mon–Sun week's logged-day calories, oldest first. */
export function weeklyAverages(points: DailyPoint[]): { weekStart: string; avgCalories: number }[] {
  const weeks = new Map<string, number[]>();
  for (const p of points) {
    if (p.mealCount === 0) continue;
    const day = new Date(`${p.date}T00:00:00`).getDay(); // 0 = Sun
    const weekStart = addLocalDays(p.date, -((day + 6) % 7));
    const list = weeks.get(weekStart) ?? [];
    list.push(p.calories);
    weeks.set(weekStart, list);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, xs]) => ({
      weekStart,
      avgCalories: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length),
    }));
}

/** Short "Mon 14" style label for a YYYY-MM-DD date — compact chart tick. */
export function chartDateLabel(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}
