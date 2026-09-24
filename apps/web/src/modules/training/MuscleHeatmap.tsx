import type { DatedExerciseSetWithWorkout } from "@liftledger/shared";
import { formatVolumeCompact, muscleLoadWeighted } from "@liftledger/shared";
import { subDays } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import { Card } from "../../components/Card";
import { SegmentedControl } from "../../components/SegmentedControl";
import { BodySilhouette } from "./BodySilhouette";
import { MuscleDetails, type TopMuscle } from "./MuscleDetails";
import { muscleBreakdown, muscleLastTrained, templateMuscleMap } from "./derive";
import type { TemplateRow } from "./queries";

type HeatmapPeriod = "7d" | "30d" | "90d";
type HeatmapMetric = "sets" | "volume";

const PERIODS: { value: HeatmapPeriod; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

const PERIOD_DAYS: Record<HeatmapPeriod, number> = { "7d": 7, "30d": 30, "90d": 90 };

// The 17 Hevy muscle groups the silhouette can render a region for — must
// match BodySilhouette's FRONT_REGIONS/BACK_REGIONS muscle names exactly.
const ON_FIGURE_MUSCLES = [
  "neck",
  "shoulders",
  "chest",
  "biceps",
  "forearms",
  "abdominals",
  "quadriceps",
  "adductors",
  "abductors",
  "calves",
  "traps",
  "upper_back",
  "lats",
  "lower_back",
  "triceps",
  "glutes",
  "hamstrings",
] as const;

const MUSCLE_LABELS: Record<string, string> = {
  upper_back: "Upper back",
  lower_back: "Lower back",
};

function muscleLabel(muscle: string): string {
  return MUSCLE_LABELS[muscle] ?? muscle.charAt(0).toUpperCase() + muscle.slice(1);
}

export interface MuscleHeatmapProps {
  sets: DatedExerciseSetWithWorkout[];
  templates: TemplateRow[];
}

/** Front/back muscle-group heatmap (PLAN-gym-expansion.md G3): intensity
 * normalized to the hottest on-figure muscle over the selected period, using
 * the same accent `color-mix` ramp technique as `routines/Heatmap.tsx`.
 * Tap a region for its exercise breakdown in the `MuscleDetails` panel beside
 * the figures (below them when the card is narrow) — floating tooltips are
 * skipped in favor of a fixed panel, since positioning one accurately against
 * the model's irregular polygon regions isn't worth the fragility, and the
 * panel has room for a readout a tooltip wouldn't. Selection is tap-only on
 * every viewport (no hover): the readout is dense enough to read deliberately,
 * which a pointer merely crossing the figure kept yanking away.
 *
 * Layout is driven by container queries rather than viewport ones, because
 * what has to fit is the card's own width — the sidebar and page padding eat
 * ~320px of the viewport, which viewport breakpoints can't see. The figures
 * are sized off the row height (100x171 viewBox at 480px tall = 281px wide
 * each), so the three bands are pinned to what actually fits:
 *   - `@4xl` (896px) and up: both figures side by side (281*2 + 8 gap + 20 gap
 *     + 288 panel = 878px), no view toggle.
 *   - `@2xl` (672px) to `@4xl`: one figure behind the front/back toggle, panel
 *     still beside it (281 + 20 + 288 = 589px).
 *   - below `@2xl`: one figure, panel stacked underneath.
 *
 * The 480px row height is therefore a ceiling, not a preference: `@4xl` leaves
 * the figures 588px, so at 8px of gap each figure caps at 290px wide — 496px
 * tall. Growing the figures past that (or widening the panel) means demoting
 * the side-by-side view to `@5xl`, i.e. losing it at a 1280px viewport. */
export function MuscleHeatmap({ sets, templates }: MuscleHeatmapProps) {
  const [period, setPeriod] = useState<HeatmapPeriod>("30d");
  const [metric, setMetric] = useState<HeatmapMetric>("sets");
  const [activeMuscle, setActiveMuscle] = useState<string | null>(null);
  const [view, setView] = useState<"front" | "back">("front");

  const now = useMemo(() => new Date(), []);
  const templateMap = useMemo(() => templateMuscleMap(templates), [templates]);

  const periodStart = useMemo(() => subDays(now, PERIOD_DAYS[period]).toISOString(), [now, period]);
  const periodSets = useMemo(
    () => sets.filter((s) => s.workout_start_time >= periodStart),
    [sets, periodStart],
  );

  const loadSets = useMemo(
    () => muscleLoadWeighted(periodSets, templateMap, "sets"),
    [periodSets, templateMap],
  );
  const loadVolume = useMemo(
    () => muscleLoadWeighted(periodSets, templateMap, "volume"),
    [periodSets, templateMap],
  );
  const load = metric === "sets" ? loadSets : loadVolume;
  const lastTrained = useMemo(() => muscleLastTrained(sets, templateMap), [sets, templateMap]);

  const maxLoad = Math.max(0, ...ON_FIGURE_MUSCLES.map((m) => load[m] ?? 0));

  const getFill = useCallback(
    (muscle: string): string => {
      const v = load[muscle] ?? 0;
      if (v <= 0 || maxLoad <= 0) return "var(--color-surface-2)";
      const t = v / maxLoad;
      const pct = Math.round(15 + t * 80);
      return `color-mix(in srgb, var(--color-accent) ${pct}%, var(--color-surface-2))`;
    },
    [load, maxLoad],
  );

  // Tapping the selected muscle again clears it, back to the ranked list.
  const handleClick = useCallback(
    (muscle: string) => setActiveMuscle((prev) => (prev === muscle ? null : muscle)),
    [],
  );

  // Scoped to `periodSets`, matching the figure's shading — "what did I do
  // for this muscle in the window I'm looking at". `lastTrained` stays on the
  // full history, since "never in the last 30d" isn't the useful answer.
  const breakdown = useMemo(
    () => (activeMuscle ? muscleBreakdown(periodSets, templateMap, activeMuscle) : null),
    [activeMuscle, periodSets, templateMap],
  );

  // Ranked by whichever metric is selected, so the idle list agrees with the
  // shading beside it rather than always ranking on sets.
  const topMuscles = useMemo<TopMuscle[]>(
    () =>
      ON_FIGURE_MUSCLES.filter((m) => (load[m] ?? 0) > 0)
        .sort((a, b) => (load[b] ?? 0) - (load[a] ?? 0))
        .map((m) => ({
          muscle: m,
          label: muscleLabel(m),
          value:
            metric === "sets"
              ? String(Math.round((load[m] ?? 0) * 10) / 10)
              : formatVolumeCompact(load[m] ?? 0),
          share: maxLoad > 0 ? (load[m] ?? 0) / maxLoad : 0,
        })),
    [load, maxLoad, metric],
  );

  return (
    <Card container>
      {/* Mobile splits the groups evenly across the row so they read as one
          control bar instead of pills adrift (front/back spans its own row
          underneath); desktop keeps them compact and right-aligned. */}
      <div className="mb-3 grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:justify-end">
        <SegmentedControl
          options={[
            { value: "sets", label: "sets" },
            { value: "volume", label: "volume" },
          ]}
          value={metric}
          onChange={setMetric}
          buttonClassName="flex-1 px-3 py-1 text-xs capitalize md:flex-none"
        />
        <SegmentedControl
          options={PERIODS}
          value={period}
          onChange={setPeriod}
          buttonClassName="flex-1 px-3 py-1 text-xs md:flex-none"
        />
        {/* Hidden once both figures fit side by side and there's nothing to
            switch between. Spans the mobile grid's second row. */}
        <SegmentedControl
          options={[
            { value: "front", label: "front" },
            { value: "back", label: "back" },
          ]}
          value={view}
          onChange={setView}
          className="col-span-2 @4xl:hidden"
          buttonClassName="flex-1 px-3 py-1 text-xs capitalize md:flex-none"
        />
      </div>

      {/* The row's height is pinned rather than left to the content, so the card
          can't resize as the selection changes: the figures scale to that height
          (their width follows the viewBox's 100x171 ratio) and the panel's list
          scrolls if it overflows. The figures center in whatever's left once the
          panel takes its fixed column. */}
      <div className="flex flex-col gap-4 @2xl:h-[480px] @2xl:flex-row @2xl:gap-5">
        <div className="flex h-[360px] justify-center gap-2 @2xl:h-full @2xl:flex-1">
          <div className={`h-full ${view === "front" ? "block" : "hidden @4xl:block"}`}>
            <BodySilhouette
              view="front"
              getFill={getFill}
              activeMuscle={activeMuscle}
              onMuscleClick={handleClick}
              className="h-full w-auto"
            />
          </div>
          <div className={`h-full ${view === "back" ? "block" : "hidden @4xl:block"}`}>
            <BodySilhouette
              view="back"
              getFill={getFill}
              activeMuscle={activeMuscle}
              onMuscleClick={handleClick}
              className="h-full w-auto"
            />
          </div>
        </div>

        <div className="h-[320px] shrink-0 @2xl:h-full @2xl:w-[288px]">
          <MuscleDetails
            muscle={activeMuscle}
            label={activeMuscle ? muscleLabel(activeMuscle) : ""}
            periodLabel={period}
            setsLoad={activeMuscle ? (loadSets[activeMuscle] ?? 0) : 0}
            volumeLoadKg={activeMuscle ? (loadVolume[activeMuscle] ?? 0) : 0}
            lastTrained={activeMuscle ? lastTrained[activeMuscle] : undefined}
            breakdown={breakdown}
            topMuscles={topMuscles}
          />
        </div>
      </div>
    </Card>
  );
}
