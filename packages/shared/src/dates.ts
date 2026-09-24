// Pure calendar/date helpers shared by the worker and web dashboard
// (REFACTOR_PLAN.md Phase 2 step 1). Timezone RESOLUTION stays at each call
// site — the worker resolves "today" against the user's IANA profile
// timezone (a remote Telegram chat has no browser clock to read), the web
// dashboard against the browser's own — this file only holds the logic
// that's identical either way.

import { isValid, parseISO } from "date-fns";

// --- worker: explicit-IANA-timezone resolution ---

/** The calendar date (YYYY-MM-DD) for `instant` in the IANA `timezone` —
 * e.g. resolving "today" for a Telegram user via their profile timezone. */
export function localDateString(instant: Date, timezone: string): string {
  // en-CA formats as YYYY-MM-DD, exactly the `date` column's shape.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Milliseconds by which `timezone`'s wall clock leads UTC at `instant`
 * (negative west of Greenwich). Derived by reading the instant's own wall
 * clock in that zone and diffing it against the instant itself — the standard
 * Intl-only approach, since this repo has no date-fns-tz. */
function zoneOffsetMs(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // `hour12: false` renders midnight as hour 24 in some ICU versions.
  const hour = get("hour") % 24;
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return asIfUtc - instant.getTime();
}

/** The exact UTC instant at which the calendar date `dateString` begins in
 * `timezone` — what "the start of Monday, for this user" means as something
 * you can compare a `timestamptz` against.
 *
 * Two passes: the first guesses the offset using the offset in force at the
 * naive UTC reading, the second re-reads it at that guess. That second pass
 * is what makes DST-transition days correct — around a spring-forward the
 * offset at 00:00 UTC and at local midnight genuinely differ. */
export function zonedDayStart(dateString: string, timezone: string): Date {
  const naive = Date.parse(`${dateString}T00:00:00Z`);
  const firstGuess = naive - zoneOffsetMs(new Date(naive), timezone);
  return new Date(naive - zoneOffsetMs(new Date(firstGuess), timezone));
}

/** Day of week for a YYYY-MM-DD calendar date, 0 = Monday .. 6 = Sunday —
 * ISO ordering, which is what "this week" means everywhere outside the US
 * consumer calendar and what training splits are written against. */
export function isoWeekday(dateString: string): number {
  const jsDay = new Date(`${dateString}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return (jsDay + 6) % 7;
}

/** First day (YYYY-MM-DD) of the calendar month `dateString` falls in. */
export function monthStartDate(dateString: string): string {
  return `${dateString.slice(0, 7)}-01`;
}

/** First day of the calendar month `months` after (negative: before) the one
 * `dateString` falls in. */
export function shiftMonthStart(dateString: string, months: number): string {
  const year = Number(dateString.slice(0, 4));
  const month = Number(dateString.slice(5, 7));
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates an explicit YYYY-MM-DD string (e.g. a `date` tool param).
 * Returns null if missing or not a real calendar date, so callers can fall
 * back to today. */
export function parseExplicitDate(date: string | undefined | null): string | null {
  if (!date || !DATE_RE.test(date)) return null;
  return isValid(parseISO(date)) ? date : null;
}

/** Resolves the effective calendar date for a worker tool call: an
 * explicit, valid `date` param if given, else today in the user's IANA
 * profile timezone. */
export function resolveDate(
  date: string | undefined | null,
  ctx: { now: Date; timezone: string },
): string {
  return parseExplicitDate(date) ?? localDateString(ctx.now, ctx.timezone);
}

// --- pure calendar-date arithmetic (no timezone involved either way) ---

/** Integer day number since the Unix epoch for a YYYY-MM-DD calendar date —
 * plain UTC-anchored arithmetic (no host-timezone traps) for walking a date
 * range or shifting by N days. */
export function dateStringToDayNumber(dateString: string): number {
  const parts = dateString.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

export function dayNumberToDateString(dayNumber: number): string {
  return new Date(dayNumber * 86_400_000).toISOString().slice(0, 10);
}

/** Shifts a YYYY-MM-DD calendar date by `deltaDays` (negative moves it
 * earlier) without any host-timezone ambiguity. */
export function shiftDate(dateString: string, deltaDays: number): string {
  return dayNumberToDateString(dateStringToDayNumber(dateString) + deltaDays);
}

// --- web: browser-local-timezone resolution ---

/** Formats a Date's own local Y/M/D as YYYY-MM-DD — for callers where the
 * Date object's host timezone (the browser's) IS the target timezone, so no
 * IANA conversion is needed. */
export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses a YYYY-MM-DD string as local midnight (not UTC) so day-of-week
 * and calendar arithmetic match what the user sees on their own clock. */
export function parseLocalDate(dateString: string): Date {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Today's calendar date (YYYY-MM-DD) in the host's own local timezone. */
export function todayLocalDate(): string {
  return formatLocalDate(new Date());
}

/** Adds `days` (may be negative) to a YYYY-MM-DD date, local-calendar-safe
 * (`setDate` handles month/year rollover in the host's own timezone). */
export function addLocalDays(dateString: string, days: number): string {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}
