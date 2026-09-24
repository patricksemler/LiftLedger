import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../lib/auth";

/**
 * Guards every route under it: while the session is resolving, shows a
 * minimal loading state (no flash of the wrong screen); once resolved, an
 * unauthenticated visit — including a direct deep-link while logged out —
 * redirects to /login, preserving the original location so login can return
 * there later. A bare visit to the root goes to the public landing page
 * instead, since there's nothing to return to.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface-0">
        <div className="text-sm text-ink-faint">Loading…</div>
      </div>
    );
  }

  if (!session) {
    if (location.pathname === "/") return <Navigate to="/welcome" replace />;
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
