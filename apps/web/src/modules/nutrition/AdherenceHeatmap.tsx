import { addLocalDays } from "@liftledger/shared";
import { useMemo } from "react";
import { Card } from "../../components/Card";
import { type DailyPoint, type DayVerdict, adherenceSummary, dayVerdict } from "./derive";

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

const VERDICT_STYLE: Record<DayVerdict, { bg: string; label: string }> = {
  hit: { bg: "var(--color-accent)", label: "on target" },
  under: {
    bg: "color-mix(in srgb, var(--color-accent) 35%, var(--color-surface-1))",
    label: "under",
  },
  over: { bg: "var(--color-negative)", label: "over" },
  none: { bg: "var(--color-surface-2)", label: "not logged" },
};

/** GitHub-style calendar of calorie-goal adherence, one cell per day (Mon-first
 * columns), plus the headline counts. Hand-rolled on the design tokens. */
export function AdherenceHeatmap({ points }: { points: DailyPoint[] }) {
  const columns = useMemo(() => {
    if (points.length === 0) return [];
    const first = points[0]?.date as string;
    const offset = (new Date(`${first}T00:00:00`).getDay() + 6) % 7; // Mon = 0
    const cells: (DailyPoint | null)[] = [...Array<null>(offset).fill(null), ...points];
    const cols: (DailyPoint | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));
    return cols;
  }, [points]);
  const summary = useMemo(() => adherenceSummary(points), [points]);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-dim">
        <Stat label="on target" value={`${summary.hitDays}/${summary.loggedDays}`} />
        <Stat label="over" value={summary.overDays} />
        <Stat label="protein hit" value={`${summary.proteinHitDays}/${summary.loggedDays}`} />
        <Stat label="avg kcal" value={summary.avgCalories ?? "—"} />
        <Stat
          label="avg protein"
          value={summary.avgProtein != null ? `${summary.avgProtein} g` : "—"}
        />
      </div>
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        <div className="flex flex-col gap-[3px]">
          {DAY_LABELS.map((label, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static row labels
            <span key={i} className="h-[13px] text-[9px] leading-[13px] text-ink-faint">
              {label}
            </span>
          ))}
        </div>
        {columns.map((col) => (
          <div key={col.find(Boolean)?.date} className="flex flex-col gap-[3px]">
            {col.map((p, i) =>
              p ? (
                <div
                  key={p.date}
                  title={`${p.date}: ${p.mealCount ? `${p.calories} kcal` : "nothing logged"} · ${VERDICT_STYLE[dayVerdict(p)].label}`}
                  className="size-[13px] rounded-[2px] border border-border/50"
                  style={{ backgroundColor: VERDICT_STYLE[dayVerdict(p)].bg }}
                />
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: leading pad cells
                <div key={`pad-${i}`} className="size-[13px]" />
              ),
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-ink-faint">
        {(["hit", "under", "over", "none"] as const).map((v) => (
          <span key={v} className="flex items-center gap-1">
            <span
              className="size-2.5 rounded-[2px]"
              style={{ backgroundColor: VERDICT_STYLE[v].bg }}
            />
            {VERDICT_STYLE[v].label}
          </span>
        ))}
        <span>· within ±10% of the calorie goal counts as on target</span>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      <span className="font-mono text-sm tabular-nums text-ink">{value}</span> {label}
    </span>
  );
}

export function lastNDays(today: string, n: number): { from: string; to: string } {
  return { from: addLocalDays(today, -(n - 1)), to: today };
}
