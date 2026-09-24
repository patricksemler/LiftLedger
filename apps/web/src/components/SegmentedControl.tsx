interface SegmentedControlOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Overrides the per-button padding/size classes — the daily/weekly
   * schedule-type toggle uses a slightly taller `py-1.5` than the period
   * selectors' `py-1`. @default "px-3 py-1 text-xs" */
  buttonClassName?: string;
}

/** The pill-style toggle (period selectors, gym's sets/volume metric
 * toggle, the routine schedule-type toggle) — previously 6 hand-rolled
 * copies of the same `overflow-hidden rounded-md border` + active/inactive
 * button styling (REFACTOR_PLAN.md Phase 6 step 1). */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  className,
  buttonClassName = "px-3 py-1 text-xs",
}: SegmentedControlProps<T>) {
  return (
    <div
      className={["flex overflow-hidden rounded-md border border-border", className]
        .filter(Boolean)
        .join(" ")}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`${buttonClassName} ${
            value === opt.value
              ? "bg-accent text-accent-ink"
              : "bg-surface-2 text-ink-dim hover:text-ink"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
