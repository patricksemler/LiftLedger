import { formatVolume, formatWeight } from "@liftledger/shared";
import type { MuscleBreakdown } from "./derive";

/** Row cap — the panel's height is fixed by its container, so this keeps the
 * common case scroll-free. Anything past it is surfaced as "+N more" rather
 * than silently dropped, and the list scrolls if it still doesn't fit. */
const MAX_EXERCISE_ROWS = 6;

/** Ranked muscles shown in the idle (nothing selected) state. */
const MAX_TOP_MUSCLES = 6;

export interface TopMuscle {
  muscle: string;
  label: string;
  /** Preformatted for the selected metric (sets vs volume) by the caller,
   * so this component never has to know which one is showing. */
  value: string;
  /** 0..1 share of the hottest muscle's load — drives the row's bar fill,
   * same normalization as the figure's intensity ramp. */
  share: number;
}

export interface MuscleDetailsProps {
  /** Null when nothing is selected — renders the ranked idle state. */
  muscle: string | null;
  label: string;
  periodLabel: string;
  /** Weighted totals straight from `muscleLoadWeighted` (secondary work at
   * half) so the header can't disagree with the figure's shading. Per-
   * exercise rows below count raw sets instead — see `MuscleExerciseStat`. */
  setsLoad: number;
  volumeLoadKg: number;
  lastTrained: string | undefined;
  breakdown: MuscleBreakdown | null;
  topMuscles: TopMuscle[];
}

/** Weighted set counts land on halves (a secondary group's set counts 0.5),
 * so this trims "12.0" to "12" while keeping "12.5" intact. */
function formatSets(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatLastTrained(iso: string | undefined): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-ink-faint">{label}</p>
      <p className="truncate font-mono text-sm tabular-nums text-ink">{value}</p>
    </div>
  );
}

function PanelFrame({ title, periodLabel, children }: PanelFrameProps) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border bg-surface-2 p-3">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="truncate text-sm font-medium text-ink">{title}</h3>
        <span className="shrink-0 font-mono text-[10px] text-ink-faint">last {periodLabel}</span>
      </div>
      {children}
    </div>
  );
}

interface PanelFrameProps {
  title: string;
  periodLabel: string;
  children: React.ReactNode;
}

/** The heatmap's readout: which exercises trained the selected muscle over the
 * chosen period, how many sets, how much volume, and the heaviest set of each.
 * Sized entirely by its container (fixed height, narrow column beside the
 * figures), so the card never resizes as the selection changes — the exercise
 * list absorbs the difference by scrolling. With nothing selected it ranks the
 * period's most-trained muscles, so the panel always carries data instead of an
 * empty prompt. Presentational only; every number is computed by MuscleHeatmap
 * from the same `muscleLoadWeighted` / `muscleBreakdown` pass that colors the
 * figure. */
export function MuscleDetails({
  muscle,
  label,
  periodLabel,
  setsLoad,
  volumeLoadKg,
  lastTrained,
  breakdown,
  topMuscles,
}: MuscleDetailsProps) {
  if (!muscle || !breakdown) {
    return (
      <PanelFrame title="Most trained" periodLabel={periodLabel}>
        {topMuscles.length === 0 ? (
          <p className="text-xs text-ink-faint">No sets logged in this period.</p>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {topMuscles.slice(0, MAX_TOP_MUSCLES).map((m) => (
              <li key={m.muscle} className="relative shrink-0 overflow-hidden rounded bg-surface-1">
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${Math.max(2, Math.round(m.share * 100))}%`,
                    background: "color-mix(in srgb, var(--color-accent) 30%, transparent)",
                  }}
                />
                <span className="relative flex items-baseline justify-between gap-2 px-2 py-1">
                  <span className="truncate text-xs text-ink-dim">{m.label}</span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-faint">
                    {m.value}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 shrink-0 border-t border-border pt-2 text-[10px] text-ink-faint">
          Tap a muscle for its exercise breakdown.
        </p>
      </PanelFrame>
    );
  }

  const rows = breakdown.exercises.slice(0, MAX_EXERCISE_ROWS);
  const hiddenCount = breakdown.exercises.length - rows.length;

  // The stat line has ~43 mono characters before it truncates in this column,
  // which "best 190 lb × 10" overruns — the bare "190 lb × 10" reads as a top
  // set well enough next to a set count, and the title carries the long form.
  const statLine = (ex: (typeof rows)[number]) =>
    [
      `${ex.sets} set${ex.sets === 1 ? "" : "s"}`,
      ex.volumeKg > 0 ? formatVolume(ex.volumeKg) : null,
      ex.bestSet ? `${formatWeight(ex.bestSet.weightKg)} × ${ex.bestSet.reps}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <PanelFrame title={label} periodLabel={periodLabel}>
      <div className="mb-2.5 grid shrink-0 grid-cols-2 gap-x-2 gap-y-1.5 border-b border-border pb-2.5">
        <Stat label="Sets" value={formatSets(setsLoad)} />
        <Stat label="Volume" value={volumeLoadKg > 0 ? formatVolume(volumeLoadKg) : "—"} />
        <Stat label="Sessions" value={String(breakdown.sessions)} />
        <Stat label="Last trained" value={formatLastTrained(lastTrained)} />
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-ink-faint">Nothing logged in the last {periodLabel}.</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col divide-y divide-border overflow-y-auto">
          {rows.map((ex) => (
            <li key={ex.key} className="shrink-0 py-1.5">
              <p className="flex items-center gap-1.5">
                <span className="truncate text-xs text-ink">{ex.title}</span>
                {ex.isSecondary && (
                  <span
                    title="Secondary muscle for this exercise — counts half toward the totals above"
                    className="shrink-0 rounded border border-border px-1 font-mono text-[9px] text-ink-faint"
                  >
                    2°
                  </span>
                )}
              </p>
              <p
                title={ex.bestSet ? `${statLine(ex)} (heaviest set)` : statLine(ex)}
                className="truncate font-mono text-[10px] tabular-nums text-ink-faint"
              >
                {statLine(ex)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 && (
        <p className="shrink-0 pt-2 text-[10px] text-ink-faint">
          +{hiddenCount} more exercise{hiddenCount === 1 ? "" : "s"}
        </p>
      )}
    </PanelFrame>
  );
}
