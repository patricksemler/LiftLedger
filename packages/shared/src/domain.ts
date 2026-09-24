// Zod schemas + inferred TS types shared between apps/web and apps/server.
// These describe the *domain* shape (what the dashboard, the bot and the
// server pass around), distinct from the raw DB row shapes in
// database.types.ts.

import { z } from "zod";

// --- profile ---

export const sexSchema = z.enum(["male", "female"]);
export type Sex = z.infer<typeof sexSchema>;

export const activityLevelSchema = z.enum([
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
]);
export type ActivityLevel = z.infer<typeof activityLevelSchema>;

export const unitsSchema = z.enum(["lb", "kg"]);
export type Units = z.infer<typeof unitsSchema>;

export const weightSourceSchema = z.enum(["hevy", "apple_health"]);
export type WeightSource = z.infer<typeof weightSourceSchema>;

/** Bodyweight is deliberately absent: it lives in `body_measurements`, owned
 * by Hevy / Apple Health sync. A hand-set value would just be shadowed by the
 * next weigh-in. */
export const profileUpdateSchema = z
  .object({
    display_name: z.string().max(80).nullable(),
    height_cm: z.number().positive().nullable(),
    birth_date: z.string().nullable(), // ISO date (YYYY-MM-DD)
    sex: sexSchema.nullable(),
    activity_level: activityLevelSchema.nullable(),
    timezone: z.string(),
    units: unitsSchema,
    weight_source: weightSourceSchema,
  })
  .partial();
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

// --- nutrition ---

export const mealConfidenceSchema = z.enum(["high", "medium", "low"]);
export type MealConfidence = z.infer<typeof mealConfidenceSchema>;

export const mealSourceSchema = z.enum(["tg_text", "tg_photo", "dashboard", "repeat"]);
export type MealSource = z.infer<typeof mealSourceSchema>;

/** Where an item's numbers came from, strongest first. */
export const matchSourceSchema = z.enum(["user", "saved_food", "recall", "usda", "off", "llm"]);
export type MatchSource = z.infer<typeof matchSourceSchema>;

const macro = z.number().nonnegative();

export const macrosSchema = z.object({
  calories: macro,
  protein_g: macro,
  carbs_g: macro,
  fat_g: macro,
  fiber_g: macro.optional(),
});
export type Macros = z.infer<typeof macrosSchema>;

export const addMealInputSchema = macrosSchema.extend({
  title: z.string().min(1),
  eaten_at: z.string().optional(),
});
export type AddMealInput = z.infer<typeof addMealInputSchema>;

export const goalPresetSchema = z.enum(["lose_fat", "maintain", "build_muscle", "custom"]);
export type GoalPreset = z.infer<typeof goalPresetSchema>;

export const setGoalInputSchema = z.object({
  preset: goalPresetSchema,
  calories: z.number().int().positive(),
  protein_g: z.number().int().nonnegative(),
  carbs_g: z.number().int().nonnegative(),
  fat_g: z.number().int().nonnegative(),
  protein_g_per_lb: z.number().positive().nullable().optional(),
  rationale: z.string().optional(),
});
export type SetGoalInput = z.infer<typeof setGoalInputSchema>;

/** Kept for metrics.computeTargets (the rate-based calculator). */
export const goalTypeSchema = z.enum(["cut", "maintain", "bulk"]);
export type GoalType = z.infer<typeof goalTypeSchema>;

// --- integrations ---

export const aiProviderKindSchema = z.enum(["openai", "anthropic", "openai_compatible"]);
export type AiProviderKind = z.infer<typeof aiProviderKindSchema>;

export const integrationProviderSchema = z.enum(["hevy", "ai", "telegram", "apple_health"]);
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;
