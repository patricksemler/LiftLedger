// Everything the bot needs to know about the user before answering: their
// "today" (profile timezone), current goal, today's totals, and last meal.

import { type Tables, localDateString } from "@liftledger/shared";
import { db, maybe, must } from "../lib/db";

export interface UserContext {
  userId: string;
  name: string | null;
  timezone: string;
  today: string;
  units: "lb" | "kg";
  goal: Tables<"nutrition_goals"> | null;
  todayTotals: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    meals: number;
  };
  lastMeal: (Tables<"meals"> & { meal_items: Tables<"meal_items">[] }) | null;
}

export async function loadUserContext(userId: string): Promise<UserContext> {
  const profile = must(await db.from("profiles").select("*").eq("user_id", userId).single());
  const today = localDateString(new Date(), profile.timezone);

  const [goal, todayMeals, lastMeal] = await Promise.all([
    db
      .from("nutrition_goals")
      .select("*")
      .eq("user_id", userId)
      .lte("effective_from", today)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(maybe),
    db
      .from("meals")
      .select("calories, protein_g, carbs_g, fat_g")
      .eq("user_id", userId)
      .eq("local_date", today)
      .then(must),
    db
      .from("meals")
      .select("*, meal_items(*)")
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 6 * 3600_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(maybe),
  ]);

  const totals = todayMeals.reduce<UserContext["todayTotals"]>(
    (a, m) => ({
      calories: a.calories + m.calories,
      protein_g: a.protein_g + m.protein_g,
      carbs_g: a.carbs_g + m.carbs_g,
      fat_g: a.fat_g + m.fat_g,
      meals: a.meals + 1,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, meals: 0 },
  );

  return {
    userId,
    name: profile.display_name,
    timezone: profile.timezone,
    today,
    units: profile.units === "kg" ? "kg" : "lb",
    goal,
    todayTotals: totals,
    lastMeal: lastMeal
      ? {
          ...lastMeal,
          meal_items: [...lastMeal.meal_items].sort((a, b) => a.position - b.position),
        }
      : null,
  };
}
