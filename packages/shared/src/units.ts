// Display-only unit formatting (PLAN-gym-expansion.md phase G5): storage and
// math stay metric everywhere (kg/cm), these functions only convert at the
// boundary where a number is about to be shown to a human. Nothing in
// metrics.ts depends on this file, so charts and AI answers keep agreeing by
// construction — only the last-mile formatting differs.

export type WeightUnit = "lb" | "kg";
export type DistanceUnit = "mi" | "m";

const KG_PER_LB = 0.45359237;
const LB_PER_KG = 1 / KG_PER_LB;
const CM_PER_IN = 2.54;
const M_PER_MI = 1609.344;

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/** Rounds to at most one decimal place and trims a trailing ".0". */
function trimDecimal(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** A single weight value for display, e.g. `formatWeight(120.2021, "lb")` ->
 * "265 lb" (120.20212100044454 kg is exactly 265 lb — a lb-labeled gym
 * machine's plate weight round-tripped through Hevy's kg storage). */
export function formatWeight(kg: number, unit: WeightUnit = "lb"): string {
  const value = unit === "lb" ? kgToLb(kg) : kg;
  return `${trimDecimal(value)} ${unit}`;
}

/** A summed volume (e.g. weekly training volume) with thousands separators,
 * e.g. `formatVolume(14683, "lb")` -> "32,380 lb". */
export function formatVolume(kg: number, unit: WeightUnit = "lb"): string {
  const value = unit === "lb" ? kgToLb(kg) : kg;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value))} ${unit}`;
}

/** Compact axis-tick form, e.g. `formatVolumeCompact(14683, "lb")` -> "32k". */
export function formatVolumeCompact(kg: number, unit: WeightUnit = "lb"): string {
  const value = unit === "lb" ? kgToLb(kg) : kg;
  if (Math.abs(value) < 1000) return `${Math.round(value)}`;
  return `${Math.round(value / 1000)}k`;
}

export interface FeetInches {
  feet: number;
  inches: number;
}

/** Converts a height in cm to whole feet + rounded inches, carrying a 12"
 * rounding overflow into an extra foot (e.g. 182.9 cm doesn't round to
 * `6'0"` worth of inches while still reading as 5'). */
export function cmToFtIn(cm: number): FeetInches {
  const totalInches = cm / CM_PER_IN;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches - feet * 12);
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

export function ftInToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_IN;
}

/** Distance for display: miles for long (cardio-scale) distances, feet for
 * short ones. `unit` picks the imperial/metric family; within "mi" family a
 * short distance still renders in feet, since "0.02 mi" is unreadable. */
export function formatDistance(m: number, unit: DistanceUnit = "mi"): string {
  if (unit === "m") {
    return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
  }
  const feet = m * 3.280839895;
  if (feet < 528) {
    // under 0.1 mi reads better as feet
    return `${Math.round(feet)} ft`;
  }
  const miles = m / M_PER_MI;
  return `${trimDecimal(miles)} mi`;
}

/** `formatDuration(600)` -> "10:00"; longer durations switch to "1h 05m". */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}
