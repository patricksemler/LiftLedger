import { formatDistance, formatDuration, formatVolume } from "@liftledger/shared";
import { Flame } from "lucide-react";
import { Card } from "../../components/Card";
import { chartWeekLabel, weekRangeLabel } from "./date";
import { type CardioTotals, type WeeklyVolumePoint, volumeDeltaLabel } from "./derive";

/** How the week's cardio relates to its sessions. The two counts used to sit
 * in separate cards as two bare "3"s, which invited reading them as 6 —
 * cardio sessions are a strict *subset* of sessions (both count distinct
 * `workout_id`s; cardio only counts the workouts holding a cardio set), so
 * they're phrased as one relationship instead of two facts. */
function cardioQualifier(sessions: number, cardioSessions: number): string | null {
  if (sessions === 0 || cardioSessions === 0) return null;
  return cardioSessions === sessions
    ? `all ${sessions} included cardio`
    : `${cardioSessions} of ${sessions} included cardio`;
}

/** Plain divs rather than a Recharts chart: this is one series, so it needs
 * no legend (identity is in the heading), no y-axis (the hero volume above is
 * the current value, and each bar carries its own week and total on hover),
 * and no responsive container. The current week is the only accent bar and
 * prior weeks recede — the "highlight one, gray the rest" emphasis pattern,
 * which is what the old stacked chart was straining to express.
 *
 * Bars are a fixed width and the strip shrinks to fit them (`w-fit`) rather
 * than each bar flexing to fill the card. A young account has 3 points and a
 * mature one has 12 (`VOLUME_WEEKS`), and flexing turns the 3-point case into
 * 300px slabs — loud, block-like, and exactly the look this panel replaced. */
function VolumeTrend({ points }: { points: WeeklyVolumePoint[] }) {
  const max = Math.max(...points.map((p) => p.total));
  // One bar is not a trend, and an all-zero window has no scale to divide by.
  if (points.length < 2 || max <= 0) return null;

  return (
    <div className="pt-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[11px] text-ink-faint">Weekly volume</p>
        <p className="font-mono text-[10px] text-ink-faint">last {points.length} wks</p>
      </div>
      <div className="flex w-fit flex-col">
        <div className="flex h-14 items-end gap-[3px]">
          {points.map((point, i) => (
            <div
              key={point.week_start}
              title={`Week of ${chartWeekLabel(point.week_start)} · ${
                point.total > 0 ? formatVolume(point.total) : "no volume"
              }`}
              className={`min-h-[2px] w-10 rounded-t-[3px] ${
                i === points.length - 1 ? "bg-accent" : "bg-accent-dim"
              }`}
              style={{ height: `${Math.round((point.total / max) * 100)}%` }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between gap-3 font-mono text-[10px] whitespace-nowrap text-ink-faint">
          <span>{chartWeekLabel(points[0]?.week_start ?? "")}</span>
          <span>this week</span>
        </div>
      </div>
    </div>
  );
}

export interface WeeklyPanelProps {
  /** Trailing weeks, oldest first — the last entry is the current week. */
  points: WeeklyVolumePoint[];
  streak: number;
  /** Null when the account has no cardio anywhere in its history, which drops
   * the cell entirely rather than parking a permanent "—" in the row. */
  cardio: CardioTotals | null;
}

/** The gym page's single weekly readout. Every number is scoped to one
 * window — this week — so the panel reads without re-deriving which span each
 * number covers; anything on a different clock belongs to another section.
 *
 * Deliberately absent, all because something else already owns them: a
 * by-region volume breakdown (the muscle heatmap below, across 17 muscles
 * with a per-exercise breakdown), "last workout" (row one of Recent
 * workouts), and a 90-day improvement stat (ExerciseProgress's `all` cell at
 * its default 90d period — the same `progressionIndex().all` value).
 *
 * The by-region stack in particular can't come back as a chart here: region
 * is *identity*, so stacking 7 of them needs 7 distinguishable hues, which
 * the app's one-accent rule (index.css) doesn't have to give. That collision
 * is what produced the previous legend of near-identical gold dots. */
export function WeeklyPanel({ points, streak, cardio }: WeeklyPanelProps) {
  const thisWeek = points.at(-1);
  const lastWeek = points.at(-2);
  const delta = volumeDeltaLabel(thisWeek?.total ?? 0, lastWeek?.total ?? 0);
  const sessions = thisWeek?.sessionCount ?? 0;
  const qualifier = cardio ? cardioQualifier(sessions, cardio.sessionCount) : null;

  return (
    <Card>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h2 className="text-sm font-medium text-ink">This week</h2>
          {thisWeek && (
            <span className="truncate font-mono text-[11px] text-ink-faint">
              {weekRangeLabel(thisWeek.week_start)}
            </span>
          )}
        </div>
        {streak > 0 && (
          <span className="flex shrink-0 items-center gap-1.5 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-dim">
            <Flame className="size-3 text-accent" aria-hidden="true" />
            {streak} wk streak
          </span>
        )}
      </div>

      <div
        className={`grid grid-cols-2 gap-4 border-b border-border pb-4 ${
          cardio ? "sm:grid-cols-[1.5fr_1fr_1fr]" : "sm:grid-cols-[1.5fr_1fr]"
        }`}
      >
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <p className="text-[11px] text-ink-faint">Volume</p>
          <p className="font-mono text-2xl tabular-nums text-ink">
            {formatVolume(thisWeek?.total ?? 0)}
          </p>
          <p
            className={`mt-0.5 truncate font-mono text-[10px] tabular-nums ${
              delta.positive ? "text-positive" : "text-negative"
            }`}
          >
            {delta.text}
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-[11px] text-ink-faint">Sessions</p>
          <p className="font-mono text-lg tabular-nums text-ink">{sessions}</p>
          {qualifier && <p className="mt-0.5 truncate text-[10px] text-ink-faint">{qualifier}</p>}
        </div>

        {cardio && (
          <div className="min-w-0">
            <p className="text-[11px] text-ink-faint">Cardio</p>
            <p className="font-mono text-lg tabular-nums text-ink">
              {cardio.durationSeconds > 0 ? formatDuration(cardio.durationSeconds) : "—"}
            </p>
            {cardio.distanceMeters > 0 && (
              <p className="mt-0.5 truncate font-mono text-[10px] tabular-nums text-ink-faint">
                {formatDistance(cardio.distanceMeters)}
              </p>
            )}
          </div>
        )}
      </div>

      <VolumeTrend points={points} />
    </Card>
  );
}
