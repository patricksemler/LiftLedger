interface SkeletonProps {
  /** Controls size, e.g. "h-56" or "h-6 w-24" — callers own the dimensions. */
  className?: string;
  /** Fakes a Card-shaped block (`border border-border bg-surface-1`) instead
   * of a plain text/bar placeholder (`bg-surface-2`). */
  bordered?: boolean;
}

/** One loading placeholder — a text-line bar or a card-shaped block,
 * depending on `bordered` — used inside each page's `animate-pulse` skeleton
 * wrapper. Previously a hand-repeated `h-N rounded[-md] [border border-border]
 * bg-surface-{1,2}` div at 20+ spots across six page skeletons
 * (REFACTOR_PLAN.md Phase 6 step 5). */
export function Skeleton({ className, bordered }: SkeletonProps) {
  return (
    <div
      className={[
        "rounded-md",
        bordered ? "border border-border bg-surface-1" : "bg-surface-2",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
