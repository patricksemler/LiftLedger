import { useMemo } from "react";
import { Card } from "../../components/Card";
import { InlineErrorState } from "../../components/ErrorState";
import { volumeDeltaLabel, weeklyVolumeSeries } from "./derive";
import { useAllSetsWithWorkoutMeta } from "./queries";

// Muscle-group breakdown isn't needed for a totals-only overview card, so
// this card skips the exercise-templates query entirely — every set just
// lands under a single unlabeled bucket, and only the (label-agnostic)
// `total`/`sessionCount` fields per week are read.
const EMPTY_MUSCLE_MAP = new Map<string, string | null>();

/** Overview card:
 * this week's sessions + volume delta vs last week.
 */
export function TrainingOverviewCard() {
  const allSetsQuery = useAllSetsWithWorkoutMeta();

  const { points } = useMemo(
    () => weeklyVolumeSeries(allSetsQuery.data ?? [], EMPTY_MUSCLE_MAP, 2, new Date()),
    [allSetsQuery.data],
  );
  const [lastWeek, thisWeek] = points;

  return (
    <Card>
      <h2 className="mb-2 text-sm font-medium text-ink">This week's training</h2>

      {allSetsQuery.isLoading ? (
        <div className="h-12 animate-pulse rounded-md bg-surface-2" />
      ) : allSetsQuery.isError ? (
        <InlineErrorState onRetry={() => void allSetsQuery.refetch()} />
      ) : !thisWeek || (thisWeek.sessionCount === 0 && (lastWeek?.sessionCount ?? 0) === 0) ? (
        <p className="text-sm text-ink-faint">
          No workouts synced yet — sync from the Training page.
        </p>
      ) : (
        <div className="flex items-end justify-between gap-2">
          <div className="shrink-0">
            <p className="font-mono text-2xl tabular-nums text-ink">{thisWeek.sessionCount}</p>
            <p className="text-xs text-ink-faint">
              session{thisWeek.sessionCount === 1 ? "" : "s"} this week
            </p>
          </div>
          {(() => {
            const delta = volumeDeltaLabel(thisWeek.total, lastWeek?.total ?? 0);
            return (
              <p
                className={`min-w-0 truncate text-right font-mono text-xs tabular-nums ${delta.positive ? "text-positive" : "text-negative"}`}
              >
                {delta.text}
              </p>
            );
          })()}
        </div>
      )}
    </Card>
  );
}
