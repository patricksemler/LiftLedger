import { AlertTriangle } from "lucide-react";
import { isRouteErrorResponse, useRouteError } from "react-router";

/**
 * Route-level error boundary (PLAN.md Phase 6: "Add an error boundary around
 * routed pages"). Set as `errorElement` on each routed page so a render-time
 * throw (a bug, not a data-fetch failure — those are handled per-page via
 * `isError` + <ErrorState/>) shows a designed screen instead of a blank
 * white page, without losing the surrounding shell (sidebar/tabs still
 * render since only the failing route's Outlet slot is replaced).
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Unknown error";

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
      <AlertTriangle className="size-6 text-negative" aria-hidden="true" />
      <p className="text-sm text-ink-dim">This page hit an error.</p>
      <p className="max-w-md break-words font-mono text-xs text-ink-faint">{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-ink transition-colors hover:bg-surface-3"
      >
        Reload
      </button>
    </div>
  );
}
