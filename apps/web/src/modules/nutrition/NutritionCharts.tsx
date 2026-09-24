import { useMemo, useState } from "react";
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
import { type DailyPoint, chartDateLabel } from "./derive";

interface NutritionChartsProps {
  /** Daily points for the full 30-day window; the 7-day view slices the
   * last 7 of these rather than issuing a second query. */
  points30: DailyPoint[];
  calorieTarget: number | null;
  proteinTarget: number | null;
}

type WindowDays = 7 | 30;

/** Recharts, styled to the design tokens (PLAN.md "Design direction"): thin
 * lines, muted grid, no default legend, real (not zero-padded) ranges. Two
 * stacked charts — daily calories vs target, and protein trend vs target. */
export function NutritionCharts({ points30, calorieTarget, proteinTarget }: NutritionChartsProps) {
  const [windowDays, setWindowDays] = useState<WindowDays>(7);
  // Unlogged days are gaps, not zeros — nothing logged isn't a fast.
  const points = useMemo(
    () =>
      (windowDays === 7 ? points30.slice(-7) : points30).map((p) =>
        p.mealCount === 0 ? { ...p, calories: null, protein_g: null } : p,
      ),
    [points30, windowDays],
  );

  const hasAnyData = points30.some((p) => p.calories > 0);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-ink">History</h2>
        <SegmentedControl
          options={[
            { value: 7, label: "7d" },
            { value: 30, label: "30d" },
          ]}
          value={windowDays}
          onChange={setWindowDays}
        />
      </div>

      {!hasAnyData ? (
        <Card as="p" padding="none" className="px-4 py-10 text-center text-sm text-ink-faint">
          No history yet — once you've logged a few meals, calorie and protein trends show up here.
        </Card>
      ) : (
        <Card className="flex flex-col gap-6">
          <ChartBlock
            title="Calories vs target"
            points={points}
            dataKey="calories"
            target={calorieTarget}
            unit="kcal"
          />
          <ChartBlock
            title="Protein vs target"
            points={points}
            dataKey="protein_g"
            target={proteinTarget}
            unit="g"
          />
        </Card>
      )}
    </div>
  );
}

function ChartBlock({
  title,
  points,
  dataKey,
  target,
  unit,
}: {
  title: string;
  points: (Omit<DailyPoint, "calories" | "protein_g"> & {
    calories: number | null;
    protein_g: number | null;
  })[];
  dataKey: "calories" | "protein_g";
  target: number | null;
  unit: string;
}) {
  return (
    <div>
      <p className="mb-2 text-xs text-ink-faint">{title}</p>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="date"
              tickFormatter={chartDateLabel}
              tick={axisTick}
              axisLine={axisLine}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={36}
              // Keep the target line in view even on light days.
              domain={[0, (max: number) => Math.max(max, target ?? 0) * 1.05]}
              tickFormatter={(v: number) => Math.round(v).toLocaleString()}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={lineCursor}
              isAnimationActive={false}
              labelFormatter={(d) => chartDateLabel(String(d))}
              formatter={(value) => [`${value} ${unit}`, ""]}
            />
            {target != null && target > 0 && (
              <ReferenceLine
                y={target}
                stroke="var(--color-ink-faint)"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
            )}
            <Line
              type="monotone"
              dataKey={dataKey}
              connectNulls={false}
              stroke="var(--color-accent)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
