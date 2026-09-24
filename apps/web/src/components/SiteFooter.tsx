import { Link } from "react-router";

/** Shared footer for the public site: landing page, Terms and Privacy. Keeps
 * the nav links in the same order and position on every page. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-ink-faint md:px-8">
        <span className="font-mono tracking-[0.2em]">LIFTLEDGER</span>
        <nav className="flex items-center gap-4">
          <Link to="/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link to="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link to="/login?mode=signup" className="text-accent hover:underline">
            Get started →
          </Link>
        </nav>
      </div>
    </footer>
  );
}
