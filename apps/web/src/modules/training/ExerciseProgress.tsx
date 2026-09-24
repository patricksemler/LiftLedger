import type { DatedExerciseSetWithWorkout, ProgressionSeries } from "@liftledger/shared";
import { PROGRESSION_SERIES, progressionIndex } from "@liftledger/shared";
import { subDays } from "date-fns";
import { useMemo, useState } from "react";
import type { TooltipContentProps } from "recharts";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "../../components/Card";
import { SegmentedControl } from "../../components/SegmentedControl";
import {
  axisLine,
  axisTick,
  gridProps,
  lineCursor,
  tooltipStyle,
} from "../../components/chartTheme";
import { formatAxisDate } from "../../lib/format";
import type { TemplateRow } from "./queries";

type ProgressPeriod = "90d" | "1y" | "all";

const PERIODS: { value: ProgressPeriod; label: string }[] = [
  { value: "90d", label: "90d" },
  { value: "1y", label: "1y" },
  { value: "all", label: "all" },
];

/** Day counts mirroring the worker's `PROGRESS_PERIOD_DAYS`
 * (apps/worker/src/modules/gym/date.ts) — kept in sync by hand since one's
 * a filter over a client-side query result and the other's a DB query
 * bound, not worth sharing a module for two numbers. */
const PERIOD_DAYS: Record<Exclude<ProgressPeriod, "all">, number> = { "90d": 90, "1y": 365 };

const MAX_VISIBLE_DOTS = 40;

interface SeriesStyle {
  label: string;
  color: string;
  width: number;
  dash?: string;
}

/** Five lines is more than a one-accent ramp can carry on its own — thin
 * amber shades three steps apart are indistinguishable at 1.5px. So identity
 * is encoded twice: hue family (amber vs. warm gray) *and* stroke pattern
 * (solid vs. dashed), which also keeps the chart readable for color-blind
 * viewers. "All" is the headline, so it takes the brightest accent at double
 * weight; the four patterns sit below it in the same palette. */
const SERIES_STYLES: Record<ProgressionSeries, SeriesStyle> = {
  all: { label: "All", color: "var(--color-accent-strong)", width: 2.5 },
  push: { label: "Push", color: "var(--color-accent)", width: 1.5 },
  pull: { label: "Pull", color: "var(--color-ink-dim)", width: 1.5 },
  legs: {
    label: "Legs",
    color: "color-mix(in srgb, var(--color-accent) 60%, var(--color-ink-dim))",
    width: 1.5,
    dash: "5 3",
  },
  core: { label: "Core", color: "var(--color-ink-faint)", width: 1.5, dash: "2 3" },
};

function formatPct(value: number, digits = 1): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

/** A line swatch rather than the usual legend dot — a dot can't show the
 * dash pattern that's carrying half of each series' identity. Drawn at the
 * series' own stroke width so the legend is a literal sample of the line,
 * down to "All" reading as the heavier one. */
function SeriesSwatch({ series }: { series: ProgressionSeries }) {
  const style = SERIES_STYLES[series];
  return (
    <svg width="12" height="3" viewBox="0 0 12 3" aria-hidden="true" className="shrink-0">
      <line
        x1="0"
        y1="1.5"
        x2="12"
        y2="1.5"
        stroke={style.color}
        strokeWidth={style.width}
        strokeDasharray={style.dash}
      />
    </svg>
  );
}

/** Hand-rolled to keep the fixed series order (Recharts sorts payload by
 * render order and tints each row its own color — illegible for the fainter
 * series). Series identity comes from the swatch; values stay one ink. */
function ProgressTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = PROGRESSION_SERIES.flatMap((series) => {
    const entry = payload.find((p) => p.dataKey === series);
    return typeof entry?.value === "number" ? [{ series, value: entry.value }] : [];
  });
  if (rows.length === 0) return null;

  return (
    <div style={tooltipStyle} className="min-w-40 px-3 py-2">
      <p className="mb-1.5 text-ink-faint">{formatAxisDate(Number(label))}</p>
      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div key={row.series} className="flex items-center justify-between gap-4 text-ink">
            <span className="flex items-center gap-1.5">
              <SeriesSwatch series={row.series} />
              {SERIES_STYLES[row.series].label}
            </span>
            <span className="tabular-nums">{formatPct(row.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ExerciseProgressProps {
  templates: TemplateRow[];
  allSets: DatedExerciseSetWithWorkout[];
}

/** Aggregate strength progression: one line for the average across every
 * exercise trained in the period, plus one per movement pattern (push/pull/
 * legs/core). Reuses @liftledger/shared's `progressionIndex` — see that function
 * for why this is a % change against each exercise's own baseline rather than
 * an average of raw e1RMs (you can't meaningfully average a 75 kg press with
 * a 14 kg lateral raise), and why a line holds flat between the sessions its
 * exercises were actually trained on. */
export function ExerciseProgress({ templates, allSets }: ExerciseProgressProps) {
  const [period, setPeriod] = useState<ProgressPeriod>("90d");
  const now = useMemo(() => new Date(), []);

  const periodStart = useMemo(
    () => (period === "all" ? null : subDays(now, PERIOD_DAYS[period]).toISOString()),
    [now, period],
  );

  const muscleMap = useMemo(
    () => new Map(templates.map((t) => [t.id, t.primary_muscle_group])),
    [templates],
  );

  const { points, exercise_counts } = useMemo(
    () => progressionIndex(allSets, muscleMap, periodStart),
    [allSets, muscleMap, periodStart],
  );

  // Recharts wants a numeric x for a time-scaled axis; the metric returns
  // ISO strings (its own callers compare them as strings).
  const chartData = useMemo(
    () => points.map((p) => ({ ...p, time: new Date(p.time).getTime() })),
    [points],
  );

  // A series only earns a line and a legend slot if some exercise feeds it —
  // no empty "Core 0%" for someone who's never trained abs.
  const series = PROGRESSION_SERIES.filter((s) => exercise_counts[s] > 0);
  const latest = points.at(-1);

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[11px] text-ink-faint">
          Average change in estimated 1RM since the start of the period
          {chartData.length < 2
            ? "."
            : `, across ${exercise_counts.all} exercise${exercise_counts.all === 1 ? "" : "s"}.`}
        </p>

        <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} />
      </div>

      {series.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border pb-4 sm:grid-cols-5">
          {series.map((s) => {
            const value = latest?.[s] ?? null;
            return (
              <div key={s}>
                <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                  <SeriesSwatch series={s} />
                  {SERIES_STYLES[s].label}
                </p>
                <p
                  className={`font-mono text-lg tabular-nums ${
                    value == null
                      ? "text-ink-faint"
                      : value >= 0
                        ? "text-positive"
                        : "text-negative"
                  }`}
                >
                  {value == null ? "—" : formatPct(value)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {chartData.length < 2 ? (
        <p className="py-6 text-center text-sm text-ink-faint">
          Not enough history in this window yet — an exercise needs at least two sessions in the
          period before there's a change to average.
        </p>
      ) : (
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={formatAxisDate}
                tick={axisTick}
                axisLine={axisLine}
                tickLine={false}
                minTickGap={32}
              />
              <YAxis
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(v) => formatPct(Number(v), 0)}
              />
              {/* The baseline every series is measured against. */}
              <ReferenceLine y={0} stroke="var(--color-border-strong)" />
              <Tooltip cursor={lineCursor} isAnimationActive={false} content={ProgressTooltip} />
              {series.map((s) => (
                <Line
                  key={s}
                  type="monotone"
                  dataKey={s}
                  stroke={SERIES_STYLES[s].color}
                  strokeWidth={SERIES_STYLES[s].width}
                  strokeDasharray={SERIES_STYLES[s].dash}
                  dot={
                    chartData.length > MAX_VISIBLE_DOTS
                      ? false
                      : { r: 2, fill: SERIES_STYLES[s].color, strokeWidth: 0 }
                  }
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
