// Week-label helpers for the gym module, built on @liftledger/shared's
// `formatLocalDate` (browser-local-timezone convention — see that module's
// header comment: the dashboard runs live in the viewer's own timezone,
// unlike the worker, which resolves dates against the profile's timezone
// for a remote Telegram chat).

import { formatLocalDate } from "@liftledger/shared";
import { addDays, startOfWeek } from "date-fns";

/** The Monday-starting week (YYYY-MM-DD) containing `date`. */
export function weekStartLocalDate(date: Date): string {
  return formatLocalDate(startOfWeek(date, { weekStartsOn: 1 }));
}

/** Short "Jun 9" style label for a YYYY-MM-DD week-start date — compact
 * chart tick, same convention as nutrition's `chartDateLabel`. */
export function chartWeekLabel(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The inclusive Mon–Sun span of a YYYY-MM-DD week-start, as "Jul 13 – 19".
 * The month repeats only when the week straddles one ("Jun 29 – Jul 5"). */
export function weekRangeLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = addDays(start, 6);
  return `${chartWeekLabel(weekStart)} – ${end.toLocaleDateString(
    undefined,
    start.getMonth() === end.getMonth() ? { day: "numeric" } : { month: "short", day: "numeric" },
  )}`;
}
