import { Link } from "react-router";

const ctaPrimary =
  "inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90";

/** Shared header for the public site: landing page, Terms and Privacy. Keeps
 * the logo, width and nav the same on every page. */
export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 md:px-8">
        <Link to="/welcome" className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
          <span className="font-mono text-sm font-medium tracking-[0.2em] text-ink">
            LIFTLEDGER
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link to="/login" className="px-3 py-2 text-sm text-ink-dim hover:text-ink">
            Sign in
          </Link>
          <Link to="/login?mode=signup" className={ctaPrimary}>
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
