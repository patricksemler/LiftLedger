import { AlertTriangle } from "lucide-react";
import { Card } from "./Card";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

/** Designed error state for a failed data view (PLAN.md Phase 6: "every data
 * view: ... an error state (not a white screen)"). Pages check `isError` on
 * their queries and render this instead of the loaded/empty layout. */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <Card padding="none" className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <AlertTriangle className="size-6 text-negative" aria-hidden="true" />
      <p className="max-w-sm text-sm text-ink-dim">
        {message ?? "Couldn't load this data. The connection may be down."}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-ink transition-colors hover:bg-surface-3"
        >
          Retry
        </button>
      )}
    </Card>
  );
}

/** Same intent as <ErrorState/> but sized for a small container (an
 * overview-grid card) rather than a full page section. */
export function InlineErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="min-w-0 truncate text-sm text-negative">{message ?? "Couldn't load this."}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 text-xs text-ink-dim underline decoration-border underline-offset-2 hover:text-ink"
        >
          Retry
        </button>
      )}
    </div>
  );
}
