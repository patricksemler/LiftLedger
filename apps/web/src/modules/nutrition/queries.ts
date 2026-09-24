// Nutrition data layer. Reads and owned writes go straight to Supabase (RLS
// scopes rows to the user); meals are inserted through the `log_meal` RPC so
// a meal and its items land atomically, and meal totals are recomputed from
// items by a DB trigger. Food search goes through the server (USDA / OFF).

import type { SetGoalInput, Tables, TablesInsert } from "@liftledger/shared";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { api } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import type { GoalRow, MealItemRow, MealRow } from "./derive";

export type SavedFoodRow = Tables<"saved_foods">;
export type { GoalRow, MealItemRow, MealRow };

export const nutritionQueryKeys = {
  all: ["nutrition"] as const,
  mealsPrefix: ["nutrition", "meals"] as const,
  meals: (fromDate: string, toDate: string) => ["nutrition", "meals", fromDate, toDate] as const,
  goals: ["nutrition", "goals"] as const,
  savedFoods: ["nutrition", "saved_foods"] as const,
  foodSearch: (q: string) => ["nutrition", "food_search", q] as const,
};

function mealsQueryOptions(fromDate: string, toDate: string) {
  return queryOptions({
    queryKey: nutritionQueryKeys.meals(fromDate, toDate),
    queryFn: async (): Promise<MealRow[]> => {
      const { data, error } = await supabase
        .from("meals")
        .select("*, meal_items(*)")
        .gte("local_date", fromDate)
        .lte("local_date", toDate)
        .order("eaten_at", { ascending: false })
        .order("position", { referencedTable: "meal_items", ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useMealsInRange(fromDate: string, toDate: string) {
  return useQuery(mealsQueryOptions(fromDate, toDate));
}

export function useMealsInRangeSuspense(fromDate: string, toDate: string) {
  return useSuspenseQuery(mealsQueryOptions(fromDate, toDate));
}

function goalsQueryOptions() {
  return queryOptions({
    queryKey: nutritionQueryKeys.goals,
    queryFn: async (): Promise<GoalRow[]> => {
      const { data, error } = await supabase
        .from("nutrition_goals")
        .select("*")
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Full goal history, newest first. Use `goalOn(goals, date)` for "current". */
export function useGoals() {
  return useQuery(goalsQueryOptions());
}

export function useGoalsSuspense() {
  return useSuspenseQuery(goalsQueryOptions());
}

/** Saves a goal effective from `effectiveFrom` (today by default). Setting a
 * goal twice on the same day replaces that day's row. */
export function useSetGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ effectiveFrom, ...input }: SetGoalInput & { effectiveFrom: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { error } = await supabase.from("nutrition_goals").upsert(
        {
          user_id: auth.user.id,
          effective_from: effectiveFrom,
          preset: input.preset,
          calories: input.calories,
          protein_g: input.protein_g,
          carbs_g: input.carbs_g,
          fat_g: input.fat_g,
          protein_g_per_lb: input.protein_g_per_lb ?? null,
          rationale: input.rationale ?? null,
        },
        { onConflict: "user_id,effective_from" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: nutritionQueryKeys.goals });
    },
  });
}

export interface NewMealItem {
  name: string;
  brand?: string | null;
  quantity?: number | null;
  unit?: string | null;
  grams?: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  match_source?: MealItemRow["match_source"];
  match_ref?: string | null;
}

export interface LogMealInput {
  title: string;
  items: NewMealItem[];
  eaten_at?: string;
  source?: MealRow["source"];
}

export function useLogMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LogMealInput) => {
      const { error } = await supabase.rpc("log_meal", {
        p_title: input.title,
        // biome-ignore lint/suspicious/noExplicitAny: jsonb param
        p_items: input.items as any,
        p_eaten_at: input.eaten_at ?? new Date().toISOString(),
        p_source: input.source ?? "dashboard",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: nutritionQueryKeys.mealsPrefix });
    },
  });
}

function invalidateMeals(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: nutritionQueryKeys.mealsPrefix });
}

export function useUpdateMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      fields,
    }: { id: string; fields: Pick<TablesInsert<"meals">, "title" | "eaten_at"> }) => {
      const { error } = await supabase.from("meals").update(fields).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => invalidateMeals(queryClient),
  });
}

export function useUpdateMealItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      fields,
    }: {
      id: string;
      fields: Partial<Pick<MealItemRow, "name" | "calories" | "protein_g" | "carbs_g" | "fat_g">>;
    }) => {
      // An edited item's numbers are the user's now, whatever matched originally.
      const { error } = await supabase
        .from("meal_items")
        .update({ ...fields, match_source: "user" })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => invalidateMeals(queryClient),
  });
}

export function useDeleteMealItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meal_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => invalidateMeals(queryClient),
  });
}

export function useDeleteMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meals").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: nutritionQueryKeys.mealsPrefix });
      const previous = queryClient.getQueriesData<MealRow[]>({
        queryKey: nutritionQueryKeys.mealsPrefix,
      });
      for (const [key, data] of previous) {
        if (data)
          queryClient.setQueryData<MealRow[]>(
            key,
            data.filter((m) => m.id !== id),
          );
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () => invalidateMeals(queryClient),
  });
}

/** Re-log a past meal now, with the same items. */
export function useRepeatMeal() {
  const logMeal = useLogMeal();
  return useMutation({
    mutationFn: async (meal: MealRow) => {
      await logMeal.mutateAsync({
        title: meal.title,
        source: "repeat",
        items: meal.meal_items.map((i) => ({
          name: i.name,
          brand: i.brand,
          quantity: i.quantity,
          unit: i.unit,
          grams: i.grams,
          calories: i.calories,
          protein_g: i.protein_g,
          carbs_g: i.carbs_g,
          fat_g: i.fat_g,
          fiber_g: i.fiber_g,
          match_source: i.match_source,
          match_ref: i.match_ref,
        })),
      });
    },
  });
}

// --- saved foods ---

function savedFoodsQueryOptions() {
  return queryOptions({
    queryKey: nutritionQueryKeys.savedFoods,
    queryFn: async (): Promise<SavedFoodRow[]> => {
      const { data, error } = await supabase
        .from("saved_foods")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useSavedFoods() {
  return useSuspenseQuery(savedFoodsQueryOptions());
}

export function useSaveFood() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (food: TablesInsert<"saved_foods">) => {
      const { error } = food.id
        ? await supabase.from("saved_foods").update(food).eq("id", food.id)
        : await supabase.from("saved_foods").insert(food);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: nutritionQueryKeys.savedFoods });
    },
  });
}

export function useDeleteSavedFood() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saved_foods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: nutritionQueryKeys.savedFoods });
    },
  });
}

// --- food search (server: USDA FoodData Central + Open Food Facts) ---

export interface FoodSearchResult {
  id: string;
  source: "usda" | "off";
  name: string;
  brand: string | null;
  serving_desc: string;
  serving_grams: number | null;
  /** Per one serving as described by serving_desc. */
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export function useFoodSearch(q: string) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: nutritionQueryKeys.foodSearch(trimmed),
    queryFn: () =>
      api<{ results: FoodSearchResult[] }>(`/api/foods/search?q=${encodeURIComponent(trimmed)}`),
    enabled: trimmed.length >= 2,
    staleTime: 10 * 60_000,
  });
}
