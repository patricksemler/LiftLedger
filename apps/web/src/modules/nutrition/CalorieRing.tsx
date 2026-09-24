interface CalorieRingProps {
  consumed: number;
  target: number | null;
}

const SIZE = 128;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Hand-rolled SVG donut (no charting library needed for a single ring) —
 * amber progress up to 100%, semantic red once consumption exceeds target
 * (PLAN.md: "over/under uses the semantic green/red tokens ONLY"). */
export function CalorieRing({ consumed, target }: CalorieRingProps) {
  const hasTarget = target != null && target > 0;
  const ratio = hasTarget ? consumed / target : 0;
  const over = hasTarget && consumed > (target as number);
  const progress = Math.min(Math.max(ratio, 0), 1);
  const dash = progress * CIRCUMFERENCE;
  const remaining = hasTarget ? (target as number) - consumed : null;

  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="-rotate-90" role="img" aria-label="Calories today">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--color-surface-2)"
          strokeWidth={STROKE}
        />
        {progress > 0 && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={over ? "var(--color-negative)" : "var(--color-accent)"}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="font-mono text-xl tabular-nums text-ink">{Math.round(consumed)}</span>
        <span className="text-[10px] text-ink-faint">
          {hasTarget ? `of ${target} kcal` : "kcal"}
        </span>
        {hasTarget && remaining !== null && (
          <span className={`text-[10px] tabular-nums ${over ? "text-negative" : "text-positive"}`}>
            {over ? `+${Math.round(-remaining)} over` : `${Math.round(remaining)} left`}
          </span>
        )}
      </div>
    </div>
  );
}
