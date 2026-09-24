import { CalorieRing } from "./CalorieRing";
import { MacroBar } from "./MacroBar";
import type { GoalRow, Totals } from "./derive";

interface TodayPanelProps {
  totals: Totals;
  goal: GoalRow | null;
}

/** Today's ring + three macro bars vs targets — PLAN.md nutrition web spec:
 * "Today panel: calorie ring + three macro bars vs targets." Shared as-is by
 * the full `/nutrition` page and the overview card.
 *
 * The ring/macro-column split uses a container query (`@sm:`), not a
 * viewport breakpoint — this panel renders inside a 2-column overview grid
 * alongside a fixed sidebar, so at plenty of real viewport widths (768,
 * 816px — the overview grid's own awkward in-between, PLAN-gym-expansion.md
 * G6) the *card* is much narrower than the *viewport*. A viewport breakpoint
 * would flip to row layout based on the wrong number, squeezing the fixed
 * 128px ring and 3 macro labels into a sliver too narrow to hold them —
 * confirmed live: "Protein" truncated to nothing at 768px viewport width
 * even though `min-w-0`/`truncate` were present. `@container`/`@sm:` key off
 * this panel's own rendered width instead, so it only goes side-by-side once
 * there's actually room. */
export function TodayPanel({ totals, goal }: TodayPanelProps) {
  return (
    <div className="@container">
      <div className="flex flex-col gap-4 @sm:flex-row @sm:items-center @sm:gap-6">
        <CalorieRing consumed={totals.calories} target={goal?.calories ?? null} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <MacroBar label="Protein" consumed={totals.protein_g} target={goal?.protein_g ?? null} />
          <MacroBar label="Carbs" consumed={totals.carbs_g} target={goal?.carbs_g ?? null} />
          <MacroBar label="Fat" consumed={totals.fat_g} target={goal?.fat_g ?? null} />
        </div>
      </div>
    </div>
  );
}
