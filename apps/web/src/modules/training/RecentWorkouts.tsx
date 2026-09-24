import { formatDistance, formatDuration, formatVolume, formatWeight } from "@liftledger/shared";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Card } from "../../components/Card";
import type { WorkoutSummary } from "./derive";

type SetLike = WorkoutSummary["exercises"][number]["sets"][number];

/** List length — the dashboard is a glance, not an archive. GymPage fetches
 * more than this (its consistency stats average over a wider recent window);
 * this is purely how many rows the list shows. */
const MAX_WORKOUTS = 5;

function formatWorkoutDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Session length in whole minutes, e.g. "58 min" — distinct from the
 * per-set `formatDuration` (mm:ss), which is for a single timed set. */
function formatSessionDuration(startIso: string, endIso: string | null): string | null {
  if (!endIso) return null;
  const minutes = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (minutes <= 0) return null;
  return `${minutes} min`;
}

function formatSet(set: SetLike): string {
  if (set.weight_kg != null && set.reps != null) {
    const tag = set.set_type === "warmup" ? " (warmup)" : "";
    return `${formatWeight(set.weight_kg)} × ${set.reps}${tag}`;
  }
  if (set.reps != null) return `${set.reps} reps`;
  if (set.duration_seconds != null) return formatDuration(set.duration_seconds);
  if (set.distance_meters != null) return formatDistance(set.distance_meters);
  return "—";
}

/** Collapses consecutive identically-formatted sets (e.g. 4 straight sets of
 * 265 lb × 6) into one `"265 lb × 6 · 4 sets"` line — PLAN-gym-expansion.md
 * G0: a 29-set workout otherwise turns into a very long mobile scroll. */
function groupConsecutiveSets(
  sets: SetLike[],
): Array<{ key: string; text: string; count: number }> {
  const groups: Array<{ key: string; text: string; count: number }> = [];
  for (const set of sets) {
    const text = formatSet(set);
    const last = groups[groups.length - 1];
    if (last && last.text === text) {
      last.count += 1;
    } else {
      groups.push({ key: String(set.id), text, count: 1 });
    }
  }
  return groups;
}

/** PLAN.md gym web spec: "Recent workouts list (expandable sets)." */
export function RecentWorkouts({ workouts }: { workouts: WorkoutSummary[] }) {
  if (workouts.length === 0) {
    return (
      <Card as="p" padding="none" className="px-4 py-10 text-center text-sm text-ink-faint">
        No workouts synced yet — use Sync now above.
      </Card>
    );
  }

  return (
    <Card as="ul" padding="none" className="flex flex-col divide-y divide-border">
      {workouts.slice(0, MAX_WORKOUTS).map((w) => (
        <WorkoutRow key={w.id} workout={w} />
      ))}
    </Card>
  );
}

function WorkoutRow({ workout }: { workout: WorkoutSummary }) {
  const [expanded, setExpanded] = useState(false);
  const duration = formatSessionDuration(workout.start_time, workout.end_time);

  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
      >
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink">{workout.title || "Untitled workout"}</p>
          <p className="truncate font-mono text-xs tabular-nums text-ink-faint">
            {formatWorkoutDate(workout.start_time)} · {workout.exercise_count} exercise
            {workout.exercise_count === 1 ? "" : "s"} · {workout.set_count} set
            {workout.set_count === 1 ? "" : "s"}
            {duration ? ` · ${duration}` : ""}
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-ink-dim">
          {formatVolume(workout.total_volume_kg)}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 px-4 pb-4 pl-11">
          {workout.exercises.map((ex) => (
            <div key={ex.title} className="min-w-0">
              <p className="mb-1 truncate text-xs font-medium text-ink-dim">{ex.title}</p>
              <ul className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs tabular-nums text-ink-faint">
                {groupConsecutiveSets(ex.sets).map((g) => (
                  <li key={g.key}>
                    {g.text}
                    {g.count > 1 ? ` · ${g.count} sets` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
