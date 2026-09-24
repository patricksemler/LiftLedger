import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "../../components/Card";
import { axisLine, axisTick, gridProps, tooltipStyle } from "../../components/chartTheme";
import type { HealthDay } from "../../lib/health";
import { type DailyPoint, chartDateLabel } from "./derive";

/** Calories eaten vs burned (Apple Health active + resting energy), last 14
 * days. Only days with both a food log and energy data are counted in the
 * net figure. */
export function EnergyBalance({ points, health }: { points: DailyPoint[]; health: HealthDay[] }) {
  const data = useMemo(() => {
    const byDate = new Map(health.map((h) => [h.date, h]));
    return points.slice(-14).map((p) => {
      const h = byDate.get(p.date);
      const burned =
        h && (h.active_kcal != null || h.basal_kcal != null)
          ? Math.round((h.active_kcal ?? 0) + (h.basal_kcal ?? 0))
          : null;
      return { date: p.date, eaten: p.mealCount ? p.calories : null, burned };
    });
  }, [points, health]);

  const both = data.filter((d) => d.eaten != null && d.burned != null);
  const net = both.length
    ? Math.round(both.reduce((a, d) => a + ((d.eaten ?? 0) - (d.burned ?? 0)), 0) / both.length)
    : null;

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-xs text-ink-dim">
        {net == null ? (
          "Not enough overlapping days yet."
        ) : (
          <>
            Average net:{" "}
            <span className={`font-mono ${net > 0 ? "text-accent" : "text-positive"}`}>
              {net > 0 ? "+" : ""}
              {net} kcal/day
            </span>{" "}
            over {both.length} days ({net > 0 ? "surplus" : "deficit"})
          </>
        )}
      </p>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barGap={1}>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="date"
              tickFormatter={chartDateLabel}
              tick={axisTick}
              axisLine={axisLine}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              contentStyle={tooltipStyle}
              isAnimationActive={false}
              labelFormatter={(d) => chartDateLabel(String(d))}
              cursor={{ fill: "var(--color-surface-2)" }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "var(--color-ink-faint)" }} />
            <Bar
              dataKey="eaten"
              name="Eaten"
              fill="var(--color-accent)"
              isAnimationActive={false}
            />
            <Bar
              dataKey="burned"
              name="Burned"
              fill="var(--color-ink-faint)"
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
