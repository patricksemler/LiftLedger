import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-surface-0 px-4 text-center">
      <p className="font-mono text-sm text-ink-faint">404</p>
      <p className="text-sm text-ink-dim">This page doesn't exist.</p>
      <Link to="/" className="text-sm text-accent hover:opacity-80">
        Back to Overview
      </Link>
    </div>
  );
}
