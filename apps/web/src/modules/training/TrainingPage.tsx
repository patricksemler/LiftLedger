import { detectPRs } from "@liftledger/shared";
import { Dumbbell } from "lucide-react";
import { Suspense, useEffect, useMemo } from "react";
import { Card } from "../../components/Card";
import { QueryErrorBoundary } from "../../components/QueryErrorBoundary";
import { Skeleton } from "../../components/Skeleton";
import { healthQueryKeys, useHealthRange } from "../../lib/health";
import { useToday } from "../../lib/profile";
import { subscribeAndInvalidate } from "../../lib/queries";
import { lastNDays } from "../nutrition/AdherenceHeatmap";
import { BodyweightPanel } from "./BodyweightPanel";
import { ExerciseProgress } from "./ExerciseProgress";
import { MuscleHeatmap } from "./MuscleHeatmap";
import { PRFeed } from "./PRFeed";
import { RecentWorkouts } from "./RecentWorkouts";
import { StepsCard } from "./StepsCard";
import { SyncStatus } from "./SyncStatus";
import { WeeklyPanel } from "./WeeklyPanel";
import {
  cardioTotals,
  effectiveVolumeWeeks,
  hasCardioSets,
  summarizeWorkouts,
  weeklySessionStreak,
  weeklyVolumeSeries,
} from "./derive";
import {
  trainingQueryKeys,
  useAllSetsWithWorkoutMetaSuspense,
  useBodyMeasurements,
  useExerciseTemplates,
  useRecentWorkouts,
  useSyncState,
} from "./queries";

/** How many recent workouts to fetch — deliberately wider than the list
 * shows (RecentWorkouts caps its own rows). */
const RECENT_WORKOUTS_LIMIT = 10;
const VOLUME_WEEKS = 12;

function TrainingPageSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-8 p-6">
      <Skeleton className="h-6 w-24" />
      <Skeleton bordered className="h-56" />
      <Skeleton bordered className="h-52" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} bordered className="h-14" />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card padding="none" className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <Dumbbell className="size-6 text-ink-faint" aria-hidden="true" />
      <p className="max-w-sm text-sm text-ink-dim">
        No Hevy data synced yet. Your muscle heatmap, progression, recent workouts and PRs show up
        here once the first sync finishes.
      </p>
      <p className="max-w-sm text-sm text-ink-faint">
        A first sync of a long history can take a few minutes — use Sync now above to check on it.
      </p>
    </Card>
  );
}

function TrainingPageContent() {
  const syncStateQuery = useSyncState();
  const recentWorkoutsQuery = useRecentWorkouts(RECENT_WORKOUTS_LIMIT);
  const allSetsQuery = useAllSetsWithWorkoutMetaSuspense();
  const templatesQuery = useExerciseTemplates();
  const bodyMeasurementsQuery = useBodyMeasurements();

  const today = useToday();
  const stepsRange = lastNDays(today, 7);
  const healthQuery = useHealthRange(stepsRange.from, stepsRange.to);

  // Realtime: cron-driven syncs (and this tab's own Sync now) invalidate
  // these queries so the dashboard never shows stale data.
  useEffect(() => {
    const subs = [
      subscribeAndInvalidate({ table: "workouts", queryKey: trainingQueryKeys.all }),
      subscribeAndInvalidate({ table: "hevy_sync_state", queryKey: trainingQueryKeys.all }),
      subscribeAndInvalidate({
        table: "body_measurements",
        queryKey: trainingQueryKeys.bodyweight,
      }),
      subscribeAndInvalidate({ table: "health_daily", queryKey: healthQueryKeys.prefix }),
    ];
    return () => {
      for (const unsub of subs) unsub();
    };
  }, []);

  const muscleMap = useMemo(
    () => new Map(templatesQuery.data.map((t) => [t.id, t.primary_muscle_group])),
    [templatesQuery.data],
  );

  const volumeWeeks = useMemo(
    () => effectiveVolumeWeeks(allSetsQuery.data, VOLUME_WEEKS, new Date()),
    [allSetsQuery.data],
  );
  const { points } = useMemo(
    () => weeklyVolumeSeries(allSetsQuery.data, muscleMap, volumeWeeks, new Date()),
    [allSetsQuery.data, muscleMap, volumeWeeks],
  );

  const workoutSummaries = useMemo(
    () => summarizeWorkouts(recentWorkoutsQuery.data, allSetsQuery.data),
    [recentWorkoutsQuery.data, allSetsQuery.data],
  );

  const prs = useMemo(() => detectPRs(allSetsQuery.data), [allSetsQuery.data]);

  // Every number the weekly panel shows comes off the same `points` /
  // `allSetsQuery` pass this page already runs for its other sections, so
  // nothing there can disagree with what's below it.
  const streak = useMemo(() => weeklySessionStreak(points), [points]);

  const hasCardioData = useMemo(() => hasCardioSets(allSetsQuery.data), [allSetsQuery.data]);
  const weeklyCardio = useMemo(
    () => cardioTotals(allSetsQuery.data, new Date()),
    [allSetsQuery.data],
  );

  const hasAnyData = recentWorkoutsQuery.data.length > 0 || bodyMeasurementsQuery.data.length > 0;
  const hasWorkoutData = recentWorkoutsQuery.data.length > 0;

  return (
    <div className="flex flex-col gap-8 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-medium text-ink">Training</h1>
        <SyncStatus syncState={syncStateQuery.data} />
      </div>

      {(healthQuery.data?.length ?? 0) > 0 ? (
        <section>
          <StepsCard days={healthQuery.data ?? []} today={today} />
        </section>
      ) : null}

      {!hasAnyData ? (
        <EmptyState />
      ) : (
        <>
          {hasWorkoutData && (
            <section>
              <WeeklyPanel
                points={points}
                streak={streak}
                cardio={hasCardioData ? weeklyCardio : null}
              />
            </section>
          )}

          {hasWorkoutData && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-ink">Muscle heatmap</h2>
              <MuscleHeatmap sets={allSetsQuery.data} templates={templatesQuery.data} />
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-medium text-ink">Bodyweight</h2>
            <BodyweightPanel entries={bodyMeasurementsQuery.data} />
          </section>

          {hasWorkoutData && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-ink">Exercise progression</h2>
              <ExerciseProgress templates={templatesQuery.data} allSets={allSetsQuery.data} />
            </section>
          )}

          {hasWorkoutData && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-ink">Recent workouts</h2>
              <RecentWorkouts workouts={workoutSummaries} />
            </section>
          )}

          {hasWorkoutData && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-ink">Recent PRs</h2>
              <PRFeed prs={prs} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default function TrainingPage() {
  return (
    <QueryErrorBoundary message="Couldn't load your training data.">
      <Suspense fallback={<TrainingPageSkeleton />}>
        <TrainingPageContent />
      </Suspense>
    </QueryErrorBoundary>
  );
}
