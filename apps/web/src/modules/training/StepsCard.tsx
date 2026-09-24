import { Footprints } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Card } from "../../components/Card";
import { axisTick, tooltipStyle } from "../../components/chartTheme";
import type { HealthDay } from "../../lib/health";

function dayLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "narrow" });
}

/** Last 7 days of steps from Apple Health, with today's count and the weekly
 * average. */
export function StepsCard({ days, today }: { days: HealthDay[]; today: string }) {
  const data = days.map((d) => ({ date: d.date, steps: d.steps ?? 0 }));
  const todaySteps = days.find((d) => d.date === today)?.steps ?? null;
  const withSteps = days.filter((d) => d.steps != null);
  const avg = withSteps.length
    ? Math.round(withSteps.reduce((a, d) => a + (d.steps ?? 0), 0) / withSteps.length)
    : null;

  return (
    <Card className="flex items-center gap-6">
      <div className="shrink-0">
        <p className="flex items-center gap-1.5 text-xs text-ink-faint">
          <Footprints className="size-3.5" aria-hidden="true" /> Steps today
        </p>
        <p className="font-mono text-2xl tabular-nums text-ink">
          {todaySteps != null ? todaySteps.toLocaleString() : "—"}
        </p>
        <p className="font-mono text-xs tabular-nums text-ink-faint">
          7-day avg {avg != null ? avg.toLocaleString() : "—"}
        </p>
      </div>
      <div className="h-20 min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="date"
              tickFormatter={dayLabel}
              tick={axisTick}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              isAnimationActive={false}
              cursor={{ fill: "var(--color-surface-2)" }}
              formatter={(v) => [Number(v).toLocaleString(), "steps"]}
            />
            <Bar
              dataKey="steps"
              fill="var(--color-accent)"
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
