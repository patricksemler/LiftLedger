import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { SiteFooter } from "../../components/SiteFooter";

/** Version of the Terms + Privacy Policy. Recorded in the user's auth
 * metadata at sign-up (`legal_version`); bump it with LAST_UPDATED whenever
 * either document changes materially. */
export const LEGAL_VERSION = "2026-09-24";
const LAST_UPDATED = "September 24, 2026";

export const CONTACT_URL = "https://github.com/patricksemler/LiftLedger/issues";

/** Shared frame for the public Terms and Privacy pages. Headings, paragraphs
 * and lists inside `children` are styled here, so the pages stay plain JSX. */
export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-dvh bg-surface-0">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 md:px-8">
        <Link to="/welcome" className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
          <span className="font-mono text-sm font-medium tracking-[0.2em] text-ink">
            LIFTLEDGER
          </span>
        </Link>
        <Link to="/login" className="text-sm text-ink-dim hover:text-ink">
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-6 pb-16 md:px-8">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mb-10 text-xs text-ink-faint">Last updated {LAST_UPDATED}</p>
        <article className="text-sm leading-relaxed text-pretty text-ink-dim [&_a]:text-accent [&_a]:hover:underline [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-medium [&_h2]:text-ink [&_li]:mb-1.5 [&_p]:mb-4 [&_strong]:font-medium [&_strong]:text-ink [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
