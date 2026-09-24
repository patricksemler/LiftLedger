import type { PREvent } from "@liftledger/shared";
import { formatWeight } from "@liftledger/shared";
import { Trophy } from "lucide-react";
import { useMemo } from "react";
import { Card } from "../../components/Card";
import { bestPRPerWorkout } from "./derive";

/** Feed length — the dashboard is a glance, not an archive. */
const MAX_PRS = 5;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** PLAN.md gym web spec: "PR feed." Reuses @liftledger/shared's `detectPRs`
 * output directly (computed once in GymPage from the same all-sets query
 * the other panels use) — most recent first, capped to a reasonable feed
 * length. Collapses same-exercise/same-workout PRs to the best one first
 * (PLAN-gym-expansion.md G0) so a single heavy session can't flood the feed
 * and each row has a stable, unique key. */
export function PRFeed({ prs }: { prs: PREvent[] }) {
  const recent = useMemo(() => bestPRPerWorkout(prs).reverse().slice(0, MAX_PRS), [prs]);

  if (recent.length === 0) {
    return (
      <Card as="p" padding="none" className="px-4 py-8 text-center text-sm text-ink-faint">
        No PRs yet — the first logged set of any weighted exercise counts as one.
      </Card>
    );
  }

  return (
    <Card as="ul" padding="none" className="flex flex-col divide-y divide-border">
      {recent.map((pr) => {
        const delta = pr.e1rm - pr.previous_best_e1rm;
        return (
          <li
            key={`${pr.workout_id}-${pr.exercise_template_id ?? pr.exercise_title}`}
            className="flex items-center gap-3 px-4 py-3"
          >
            <Trophy className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{pr.exercise_title}</p>
              <p className="truncate font-mono text-xs tabular-nums text-ink-faint">
                {formatDate(pr.workout_start_time)} · {formatWeight(pr.weight_kg)} × {pr.reps}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="font-mono text-xs tabular-nums text-positive">
                {formatWeight(pr.e1rm)} e1RM
              </span>
              {pr.previous_best_e1rm > 0 && (
                <span className="font-mono text-[10px] tabular-nums text-ink-faint">
                  +{formatWeight(delta)} vs previous best
                </span>
              )}
            </div>
          </li>
        );
      })}
    </Card>
  );
}
