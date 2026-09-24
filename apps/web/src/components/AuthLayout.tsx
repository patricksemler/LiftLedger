import type { ReactNode } from "react";
import { Link } from "react-router";

export const authInputClass =
  "mb-4 w-full rounded-md border border-border bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus-visible:border-accent";
export const authLabelClass = "mb-1 block text-xs text-ink-dim";
export const authButtonClass =
  "w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50";

/** Centered wordmark + tagline frame shared by sign-in, sign-up and the
 * password-reset screens. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-0 px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/welcome" className="mb-2 flex items-center justify-center gap-2">
          <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
          <span className="font-mono text-sm font-medium tracking-[0.2em] text-ink">
            LIFTLEDGER
          </span>
        </Link>
        <p className="mb-8 text-center text-xs text-ink-faint">
          Your training, nutrition and health in one ledger.
        </p>
        {children}
      </div>
    </div>
  );
}

/** Minimum length enforced client-side for new passwords. */
export const MIN_PASSWORD_LENGTH = 8;

/** Returns an error message for a new password + its confirmation, or null
 * when they're acceptable. */
export function newPasswordError(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  }
  if (password !== confirm) return "Passwords don't match.";
  return null;
}
