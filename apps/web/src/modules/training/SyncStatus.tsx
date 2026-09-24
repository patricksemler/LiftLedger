import { RefreshCw } from "lucide-react";
import { relativeTime } from "../../lib/format";
import type { SyncStateRow } from "./queries";
import { useSyncNow } from "./queries";

interface SyncStatusProps {
  syncState: SyncStateRow | null;
}

/** "Sync now" + last-synced line, read from hevy_sync_state. */
export function SyncStatus({ syncState }: SyncStatusProps) {
  const syncNow = useSyncNow();

  let statusLine: string;
  if (!syncState) {
    statusLine = "Not synced yet";
  } else if (!syncState.backfill_done) {
    statusLine = `Backfilling… (page ${syncState.backfill_page})`;
  } else if (syncState.last_run_at) {
    statusLine = `Last synced ${relativeTime(syncState.last_run_at)}`;
  } else {
    statusLine = "Synced";
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className="font-mono text-xs tabular-nums text-ink-faint">{statusLine}</p>
        {syncState?.last_error && (
          <p className="max-w-[16rem] truncate text-xs text-negative" title={syncState.last_error}>
            {syncState.last_error}
          </p>
        )}
      </div>
      {syncNow.isError && (
        <p className="text-xs text-negative">{(syncNow.error as Error).message}</p>
      )}
      <button
        type="button"
        onClick={() => syncNow.mutate()}
        disabled={syncNow.isPending}
        className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs text-ink hover:bg-surface-3 disabled:opacity-60"
      >
        <RefreshCw
          className={`size-3.5 ${syncNow.isPending ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        {syncNow.isPending ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
