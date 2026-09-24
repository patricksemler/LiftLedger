// Shared Recharts styling tokens (PLAN-gym-expansion.md phase G0/G1):
// previously each chart file (gym's ExerciseProgress, nutrition's
// NutritionCharts) redeclared an identical `tooltipStyle` object
// and repeated the same axis/grid prop blocks — any tweak needed making in
// three places. One copy here, consumed by all of them.

/** Recharts `<Tooltip contentStyle>`. */
export const tooltipStyle = {
  background: "var(--color-surface-2)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  fontSize: 12,
  color: "var(--color-ink)",
};

/** Shared `<XAxis>`/`<YAxis>` tick label style. */
export const axisTick = { fill: "var(--color-ink-faint)", fontSize: 10 };

/** Shared `<XAxis axisLine>` stroke. */
export const axisLine = { stroke: "var(--color-border)" };

/** Shared `<CartesianGrid>` props. */
export const gridProps = {
  stroke: "var(--color-border)",
  strokeDasharray: "2 4",
  vertical: false,
};

/** `<Tooltip cursor>` for line charts: a subtle vertical guide instead of the
 * same default light-gray rectangle. */
export const lineCursor = { stroke: "var(--color-border-strong)" };
