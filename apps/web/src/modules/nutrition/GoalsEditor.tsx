import {
  GOAL_PRESETS,
  type GoalPreset,
  PROTEIN_PER_LB_RANGE,
  missingGoalFields,
  presetTargets,
} from "@liftledger/shared";
import { useMemo, useState } from "react";
import { Card } from "../../components/Card";
import { SegmentedControl } from "../../components/SegmentedControl";
import type { ProfileRow } from "../../lib/profile";
import type { GoalRow } from "./derive";
import { useSetGoal } from "./queries";

interface GoalsEditorProps {
  profile: ProfileRow;
  weightKg: number | null;
  current: GoalRow | null;
  today: string;
  onSaved?: () => void;
}

const PRESET_OPTIONS: { value: GoalPreset; label: string }[] = [
  { value: "lose_fat", label: "Lose fat" },
  { value: "maintain", label: "Maintain" },
  { value: "build_muscle", label: "Build muscle" },
  { value: "custom", label: "Custom" },
];

type Fields = { calories: string; protein_g: string; carbs_g: string; fat_g: string };

const inputClass =
  "w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink tabular-nums placeholder:text-ink-faint focus-visible:outline-accent";

/** Pick a preset (computed from the profile via Mifflin-St Jeor) or type
 * custom numbers. Presets can be fine-tuned before saving; touching any
 * number turns the goal into "custom". Saving creates the goal effective
 * today, so past days keep being judged against the goal they had. */
export function GoalsEditor({ profile, weightKg, current, today, onSaved }: GoalsEditorProps) {
  const setGoal = useSetGoal();
  const goalProfile = useMemo(() => ({ ...profile, weight_kg: weightKg }), [profile, weightKg]);
  const missing = missingGoalFields(goalProfile);
  const canCompute = missing.length === 0;

  const [preset, setPreset] = useState<GoalPreset>(
    (current?.preset as GoalPreset | undefined) ?? (canCompute ? "build_muscle" : "custom"),
  );
  const [proteinPerLb, setProteinPerLb] = useState<number | null>(
    current?.protein_g_per_lb ?? null,
  );
  const [fields, setFields] = useState<Fields>({
    calories: current ? String(current.calories) : "",
    protein_g: current ? String(current.protein_g) : "",
    carbs_g: current ? String(current.carbs_g) : "",
    fat_g: current ? String(current.fat_g) : "",
  });

  const computed = useMemo(() => {
    if (preset === "custom" || !canCompute) return null;
    return presetTargets(goalProfile, preset, { proteinPerLb: proteinPerLb ?? undefined });
  }, [preset, proteinPerLb, canCompute, goalProfile]);

  const shown: Fields = computed
    ? {
        calories: String(computed.calories),
        protein_g: String(computed.protein_g),
        carbs_g: String(computed.carbs_g),
        fat_g: String(computed.fat_g),
      }
    : fields;

  function choosePreset(p: GoalPreset) {
    if (p === "custom" && computed) {
      setFields({
        calories: String(computed.calories),
        protein_g: String(computed.protein_g),
        carbs_g: String(computed.carbs_g),
        fat_g: String(computed.fat_g),
      });
    }
    setPreset(p);
    if (p !== "custom") setProteinPerLb(null);
  }

  function editField(key: keyof Fields, value: string) {
    setFields({ ...shown, [key]: value });
    setPreset("custom");
  }

  const numbers = {
    calories: Number(shown.calories),
    protein_g: Number(shown.protein_g),
    carbs_g: Number(shown.carbs_g || 0),
    fat_g: Number(shown.fat_g || 0),
  };
  const valid =
    numbers.calories > 0 && Object.values(numbers).every((n) => Number.isFinite(n) && n >= 0);
  const macroKcal = numbers.protein_g * 4 + numbers.carbs_g * 4 + numbers.fat_g * 9;

  async function save() {
    if (!valid) return;
    await setGoal.mutateAsync({
      effectiveFrom: today,
      preset,
      calories: Math.round(numbers.calories),
      protein_g: Math.round(numbers.protein_g),
      carbs_g: Math.round(numbers.carbs_g),
      fat_g: Math.round(numbers.fat_g),
      protein_g_per_lb: computed?.protein_g_per_lb ?? null,
      rationale: computed?.rationale ?? "Custom targets",
    });
    onSaved?.();
  }

  const spec = preset !== "custom" ? GOAL_PRESETS[preset] : null;
  const perLbShown = computed?.protein_g_per_lb ?? spec?.proteinPerLb ?? 0.8;

  return (
    <Card className="flex flex-col gap-4">
      <SegmentedControl options={PRESET_OPTIONS} value={preset} onChange={choosePreset} />

      {!canCompute && preset !== "custom" && (
        <p className="text-xs text-negative">
          Presets need your {missing.join(", ")}. Fill in your profile (weight syncs from Hevy or
          Apple Health), or use Custom.
        </p>
      )}
      {spec && <p className="text-xs text-ink-dim">{spec.blurb}</p>}
      {computed && (
        <p className="text-xs text-ink-faint">
          Maintenance ≈ {computed.maintenance_kcal.toLocaleString()} kcal/day.
        </p>
      )}

      {preset !== "custom" && canCompute && (
        <label className="flex flex-col gap-1 text-xs text-ink-dim">
          <span>
            Protein: <span className="font-mono text-ink">{perLbShown.toFixed(2)} g/lb</span>
          </span>
          <input
            type="range"
            min={PROTEIN_PER_LB_RANGE.min}
            max={PROTEIN_PER_LB_RANGE.max}
            step={0.01}
            value={perLbShown}
            onChange={(e) => setProteinPerLb(Number(e.target.value))}
            className="accent-[var(--color-accent)]"
          />
        </label>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ["calories", "kcal"],
            ["protein_g", "protein g"],
            ["carbs_g", "carbs g"],
            ["fat_g", "fat g"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1 text-[11px] text-ink-faint">
            {label}
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={shown[key]}
              onChange={(e) => editField(key, e.target.value)}
              className={inputClass}
            />
          </label>
        ))}
      </div>
      {valid && Math.abs(macroKcal - numbers.calories) > numbers.calories * 0.05 && (
        <p className="text-xs text-ink-faint">
          Heads up: these macros add up to {Math.round(macroKcal)} kcal, not{" "}
          {numbers.calories.toLocaleString()}.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!valid || setGoal.isPending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {setGoal.isPending ? "Saving…" : "Save goal"}
        </button>
        {current && (
          <span className="text-[11px] text-ink-faint">
            Current goal since {current.effective_from}
          </span>
        )}
        {setGoal.isError && <span className="text-xs text-negative">Couldn't save.</span>}
      </div>
    </Card>
  );
}
