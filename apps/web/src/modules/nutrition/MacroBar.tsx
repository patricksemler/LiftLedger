interface MacroBarProps {
  label: string;
  consumed: number;
  target: number | null;
}

/** A single macro-vs-target bar — amber fill, semantic red only once over
 * target (PLAN.md design direction: green/red reserved for over/under). */
export function MacroBar({ label, consumed, target }: MacroBarProps) {
  const hasTarget = target != null && target > 0;
  const ratio = hasTarget ? consumed / (target as number) : 0;
  const over = hasTarget && consumed > (target as number);
  const widthPct = hasTarget ? Math.min(Math.max(ratio, 0), 1) * 100 : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-ink-dim">{label}</span>
        <span
          className={`shrink-0 font-mono text-xs tabular-nums ${over ? "text-negative" : "text-ink-faint"}`}
        >
          {Math.round(consumed)}
          {hasTarget ? `/${target}` : ""}g
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${widthPct}%`,
            backgroundColor: over ? "var(--color-negative)" : "var(--color-accent)",
          }}
        />
      </div>
    </div>
  );
}
