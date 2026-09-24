import { formatWeight, kgToLb, weightTrend } from "@liftledger/shared";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
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
import type { BodyMeasurementEntry } from "./queries";

type WeightPeriod = "30d" | "90d" | "1y" | "all";

const PERIODS: { value: WeightPeriod; label: string }[] = [
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "1y", label: "1y" },
  { value: "all", label: "all" },
];

/** Mirrors the worker's `WEIGHT_PERIOD_DAYS` (apps/worker/src/modules/gym/date.ts). */
const PERIOD_DAYS: Record<Exclude<WeightPeriod, "all">, number> = {
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

/** Bodyweight panel — PLAN-gym-expansion.md G2: raw daily weigh-in dots
 * (faint) + a 7-day rolling-average accent line, period selector, stat row.
 * Reuses @liftledger/shared's `weightTrend` directly (the same function the
 * worker's gym.get_weight tool calls) so the chart and "what's my weight
 * trend?" over Telegram always agree. */
export function BodyweightPanel({ entries }: { entries: BodyMeasurementEntry[] }) {
  const [period, setPeriod] = useState<WeightPeriod>("90d");

  const trend = useMemo(
    () => weightTrend(entries, period === "all" ? null : PERIOD_DAYS[period]),
    [entries, period],
  );

  const chartData = useMemo(
    () =>
      (trend?.points ?? []).map((p) => ({
        time: new Date(`${p.date}T00:00:00`).getTime(),
        weight_kg: p.weight_kg,
        rolling_avg_kg: p.rolling_avg_kg,
      })),
    [trend],
  );

  if (entries.length === 0) {
    return (
      <Card as="p" padding="none" className="px-4 py-10 text-center text-sm text-ink-faint">
        No weigh-ins synced yet — log a body-measurement weight in Hevy and sync to see your trend
        here.
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border pb-4">
        {/* min-w keeps the stats from being squeezed to a two-line "139.8 /
            lb" by the selector: below it the row wraps and the selector drops
            to its own line instead (there's no honest way to fit both on a
            375px screen). */}
        <div className="grid min-w-52 flex-1 grid-cols-2 gap-3">
          {trend && (
            <>
              <div>
                <p className="text-[11px] text-ink-faint">Current weight</p>
                <p className="font-mono text-lg tabular-nums text-ink">
                  {formatWeight(trend.rolling_avg_kg)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-ink-faint">Δ / week</p>
                <p
                  className={`font-mono text-lg tabular-nums ${trend.rate_kg_per_week <= 0 ? "text-positive" : "text-negative"}`}
                >
                  {trend.rate_kg_per_week >= 0 ? "+" : ""}
                  {formatWeight(trend.rate_kg_per_week)}
                </p>
              </div>
            </>
          )}
        </div>

        <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} />
      </div>

      {chartData.length < 2 ? (
        <p className="py-6 text-center text-sm text-ink-faint">
          Not enough weigh-ins in this window to chart a trend yet.
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
                width={36}
                tickFormatter={(v) => `${Math.round(kgToLb(Number(v)))}`}
                domain={([dataMin, dataMax]: readonly [number, number]) => {
                  const pad = Math.max((dataMax - dataMin) * 0.1, 1);
                  return [Math.floor(dataMin - pad), Math.ceil(dataMax + pad)] as const;
                }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={lineCursor}
                isAnimationActive={false}
                labelFormatter={(t) => formatAxisDate(Number(t))}
                formatter={(value, name) => [
                  formatWeight(Number(value)),
                  name === "rolling_avg_kg" ? "7-day avg" : "weigh-in",
                ]}
              />
              <Line
                type="monotone"
                dataKey="weight_kg"
                stroke="transparent"
                dot={{ r: 2, fill: "var(--color-ink-faint)", strokeWidth: 0 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="rolling_avg_kg"
                stroke="var(--color-accent)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
