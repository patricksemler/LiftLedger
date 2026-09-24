// Small display-formatting helpers shared across web modules
// (REFACTOR_PLAN.md Phase 2 step 6) — previously duplicated byte-for-byte
// in gym/SyncStatus.tsx + brief/SendStatus.tsx (relativeTime) and
// gym/BodyweightPanel.tsx + gym/ExerciseProgress.tsx (formatAxisDate).

/** "3m ago" / "2h ago" / "5d ago" style relative timestamp, for a last-sync
 * or last-run status line. */
export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** Short "Jun 9" style chart-axis tick for a millisecond timestamp. */
export function formatAxisDate(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
