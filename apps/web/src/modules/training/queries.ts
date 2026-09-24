// Training data layer. Everything here is sync-owned (Hevy / Apple Health)
// and read-only for the dashboard; RLS scopes every row to the user. "Sync
// now" goes through the server, which holds the Hevy key.

import type { DatedExerciseSetWithWorkout, Tables } from "@liftledger/shared";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { apiPost } from "../../lib/api";
import { supabase } from "../../lib/supabase";

type WorkoutRow = Tables<"workouts">;
export type TemplateRow = Tables<"exercise_templates">;
export type SyncStateRow = Tables<"hevy_sync_state">;

export const trainingQueryKeys = {
  all: ["training"] as const,
  syncState: ["training", "sync_state"] as const,
  recentWorkouts: (limit: number) => ["training", "workouts", "recent", limit] as const,
  allSets: ["training", "sets", "all"] as const,
  templates: ["training", "templates"] as const,
  bodyweight: ["training", "bodyweight"] as const,
};

/** PostgREST caps responses at `max_rows` (1000 locally); a lifting history
 * easily has more sets than that, so page through with range(). */
const PAGE = 1000;
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

function syncStateQueryOptions() {
  return queryOptions({
    queryKey: trainingQueryKeys.syncState,
    queryFn: async (): Promise<SyncStateRow | null> => {
      const { data, error } = await supabase.from("hevy_sync_state").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSyncState() {
  return useSuspenseQuery(syncStateQueryOptions());
}

function recentWorkoutsQueryOptions(limit: number) {
  return queryOptions({
    queryKey: trainingQueryKeys.recentWorkouts(limit),
    queryFn: async (): Promise<WorkoutRow[]> => {
      const { data, error } = await supabase
        .from("workouts")
        .select("*")
        .order("start_time", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export function useRecentWorkouts(limit = 10) {
  return useSuspenseQuery(recentWorkoutsQueryOptions(limit));
}

/** A set plus the identity/ordering columns the recent-workouts list needs. */
export interface SetWithWorkoutMeta extends DatedExerciseSetWithWorkout {
  id: number;
  exercise_index: number;
  set_index: number;
}

/** Every set the user has logged, stamped with its workout's start_time —
 * the shape @liftledger/shared's metrics helpers expect. Two paged queries
 * joined client-side (simpler and cheaper than an embedded join per row). */
function allSetsQueryOptions() {
  return queryOptions({
    queryKey: trainingQueryKeys.allSets,
    queryFn: async (): Promise<SetWithWorkoutMeta[]> => {
      const [workouts, sets] = await Promise.all([
        fetchAll<{ id: string; start_time: string }>((from, to) =>
          supabase.from("workouts").select("id, start_time").order("id").range(from, to),
        ),
        fetchAll<Omit<SetWithWorkoutMeta, "workout_start_time">>((from, to) =>
          supabase
            .from("workout_sets")
            .select(
              "id, exercise_template_id, exercise_title, exercise_index, set_index, weight_kg, reps, set_type, workout_id, rpe, distance_meters, duration_seconds",
            )
            .order("id")
            .range(from, to),
        ),
      ]);
      const startById = new Map(workouts.map((w) => [w.id, w.start_time]));
      const result: SetWithWorkoutMeta[] = [];
      for (const s of sets) {
        const start = startById.get(s.workout_id);
        if (start) result.push({ ...s, workout_start_time: start });
      }
      return result;
    },
  });
}

export function useAllSetsWithWorkoutMeta() {
  return useQuery(allSetsQueryOptions());
}

export function useAllSetsWithWorkoutMetaSuspense() {
  return useSuspenseQuery(allSetsQueryOptions());
}

function templatesQueryOptions() {
  return queryOptions({
    queryKey: trainingQueryKeys.templates,
    queryFn: () =>
      fetchAll<TemplateRow>((from, to) =>
        supabase
          .from("exercise_templates")
          .select("*")
          .order("title", { ascending: true })
          .range(from, to),
      ),
  });
}

export function useExerciseTemplates() {
  return useSuspenseQuery(templatesQueryOptions());
}

export function useExerciseTemplatesMaybe() {
  return useQuery(templatesQueryOptions());
}

export interface BodyMeasurementEntry {
  date: string;
  weight_kg: number;
}

/** Every weigh-in, from the user's preferred source (the `bodyweight` view
 * merges Hevy and Apple Health per day). */
function bodyweightQueryOptions() {
  return queryOptions({
    queryKey: trainingQueryKeys.bodyweight,
    queryFn: async (): Promise<BodyMeasurementEntry[]> => {
      const rows = await fetchAll<{ date: string | null; weight_kg: number | null }>((from, to) =>
        supabase
          .from("bodyweight")
          .select("date, weight_kg")
          .order("date", { ascending: true })
          .range(from, to),
      );
      return rows
        .filter((r): r is BodyMeasurementEntry => r.date != null && r.weight_kg != null)
        .map((r) => ({ date: r.date, weight_kg: r.weight_kg }));
    },
  });
}

export function useBodyMeasurements() {
  return useSuspenseQuery(bodyweightQueryOptions());
}

/** Asks the server to run a Hevy sync now (backfill if it hasn't finished,
 * otherwise incremental). Progress arrives via Realtime on hevy_sync_state. */
export function useSyncNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ queued: boolean }>("/api/hevy/sync"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trainingQueryKeys.syncState });
    },
  });
}

let staleSyncRequested = false;

/** Once per page load, asks the server to sync Hevy if the last run is more
 * than 30 minutes old. The hosted (serverless) deployment only has a daily
 * cron, so opening the dashboard is what keeps workouts fresh; results land
 * via the Realtime subscriptions. Errors (e.g. Hevy not connected) are
 * irrelevant here and ignored. */
export function useSyncIfStale() {
  useEffect(() => {
    if (staleSyncRequested) return;
    staleSyncRequested = true;
    apiPost("/api/hevy/sync", { ifStaleMinutes: 30 }).catch(() => {});
  }, []);
}
