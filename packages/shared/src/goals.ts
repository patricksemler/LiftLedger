// Goal presets: turn a profile + a named goal into concrete daily targets.
// Pure and deterministic — the dashboard previews these before saving, and
// the server uses the same function so both always agree.

import type { ActivityLevel, GoalPreset, Sex } from "./domain.js";
import { bmrMifflinStJeor, tdee } from "./metrics.js";

const KG_PER_LB = 0.45359237;

interface PresetSpec {
  label: string;
  /** Multiplier applied to TDEE. */
  calorieFactor: number;
  /** Default protein, grams per pound of bodyweight. */
  proteinPerLb: number;
  blurb: string;
}

export const GOAL_PRESETS: Record<Exclude<GoalPreset, "custom">, PresetSpec> = {
  lose_fat: {
    label: "Lose fat",
    calorieFactor: 0.8,
    proteinPerLb: 1.0,
    blurb: "20% below maintenance. High protein protects muscle while in a deficit.",
  },
  maintain: {
    label: "Maintain",
    calorieFactor: 1.0,
    proteinPerLb: 0.8,
    blurb: "Eat at maintenance. 0.8 g/lb comfortably covers recovery.",
  },
  build_muscle: {
    label: "Build muscle",
    calorieFactor: 1.1,
    proteinPerLb: 0.73,
    blurb:
      "10% surplus (lean bulk). ~0.73 g/lb (1.6 g/kg) is where extra protein stops adding measurable muscle gain.",
  },
};

/** The protein range the goals editor lets users slide across. */
export const PROTEIN_PER_LB_RANGE = { min: 0.6, max: 1.2 } as const;
/** Fat floor, grams per pound — below this hormones and satiety suffer. */
const FAT_PER_LB_FLOOR = 0.3;

/** Loose on purpose: DB rows carry sex/activity_level as plain text (check
 * constraints, not enums), so anything unexpected counts as missing. */
export interface GoalProfile {
  weight_kg: number | null;
  height_cm: number | null;
  birth_date: string | null;
  sex: string | null;
  activity_level: string | null;
}

const SEXES: readonly string[] = ["male", "female"];
const ACTIVITY_LEVELS: readonly string[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
];

export interface PresetTargets {
  preset: Exclude<GoalPreset, "custom">;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  protein_g_per_lb: number;
  maintenance_kcal: number;
  rationale: string;
}

export function ageOn(birthDate: string, now: Date): number {
  const [y, m, d] = birthDate.split("-").map(Number) as [number, number, number];
  let age = now.getFullYear() - y;
  const monthDiff = now.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d)) age -= 1;
  return age;
}

/** Fields a profile still needs before presets can be computed. */
export function missingGoalFields(profile: GoalProfile): string[] {
  const missing: string[] = [];
  if (profile.weight_kg == null) missing.push("weight");
  if (profile.height_cm == null) missing.push("height");
  if (profile.birth_date == null) missing.push("birth date");
  if (profile.sex == null || !SEXES.includes(profile.sex)) missing.push("sex");
  if (profile.activity_level == null || !ACTIVITY_LEVELS.includes(profile.activity_level))
    missing.push("activity level");
  return missing;
}

export function maintenanceCalories(profile: GoalProfile, now = new Date()): number {
  const missing = missingGoalFields(profile);
  if (missing.length > 0) {
    throw new Error(`Profile is missing ${missing.join(", ")}.`);
  }
  const bmr = bmrMifflinStJeor({
    weightKg: profile.weight_kg as number,
    heightCm: profile.height_cm as number,
    age: ageOn(profile.birth_date as string, now),
    sex: profile.sex as Sex,
  });
  return tdee(bmr, profile.activity_level as ActivityLevel);
}

/** Targets for a preset. `proteinPerLb` overrides the preset default (the
 * editor's slider); it's clamped to PROTEIN_PER_LB_RANGE. Carbs fill whatever
 * calories are left after protein and the fat floor. */
export function presetTargets(
  profile: GoalProfile,
  preset: Exclude<GoalPreset, "custom">,
  options: { proteinPerLb?: number; now?: Date } = {},
): PresetTargets {
  const spec = GOAL_PRESETS[preset];
  const maintenance = maintenanceCalories(profile, options.now);
  const weightLb = (profile.weight_kg as number) / KG_PER_LB;
  const perLb = Math.min(
    PROTEIN_PER_LB_RANGE.max,
    Math.max(PROTEIN_PER_LB_RANGE.min, options.proteinPerLb ?? spec.proteinPerLb),
  );

  const calories = Math.round((maintenance * spec.calorieFactor) / 10) * 10;
  const protein_g = Math.round(weightLb * perLb);
  const fat_g = Math.round(Math.max(weightLb * FAT_PER_LB_FLOOR, (calories * 0.25) / 9));
  const carbs_g = Math.max(0, Math.round((calories - protein_g * 4 - fat_g * 9) / 4));

  const pct = Math.round((spec.calorieFactor - 1) * 100);
  const delta =
    pct === 0
      ? "at maintenance"
      : pct < 0
        ? `${-pct}% below maintenance`
        : `${pct}% above maintenance`;
  const rationale = `${spec.label}: maintenance ≈ ${Math.round(maintenance)} kcal (Mifflin-St Jeor × activity), ${delta}; protein ${perLb.toFixed(2)} g/lb.`;

  return {
    preset,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    protein_g_per_lb: Number(perLb.toFixed(2)),
    maintenance_kcal: Math.round(maintenance),
    rationale,
  };
}
