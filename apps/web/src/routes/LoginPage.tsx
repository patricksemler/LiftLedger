import { useActionState, useState } from "react";
import { Link, type Location, Navigate, useLocation, useSearchParams } from "react-router";
import {
  AuthLayout,
  MIN_PASSWORD_LENGTH,
  authButtonClass,
  authInputClass,
  authLabelClass,
  newPasswordError,
} from "../components/AuthLayout";
import { Card } from "../components/Card";
import { useAuth } from "../lib/auth";
import { authRedirectUrl, emailLinkError, supabase } from "../lib/supabase";
import { LEGAL_VERSION } from "./legal/LegalLayout";

type Mode = "sign_in" | "sign_up";

type Result = { error: string; unconfirmed?: boolean } | null;

export function LoginPage() {
  const { session, loading: sessionLoading } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // The landing page's "Get started" links here with ?mode=signup.
  const [mode, setMode] = useState<Mode>(
    searchParams.get("mode") === "signup" ? "sign_up" : "sign_in",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);
  // Set after a sign-up that needs email confirmation: the address the link went to.
  const [sentTo, setSentTo] = useState<string | null>(null);

  const [result, formAction, submitting] = useActionState<Result>(async () => {
    if (mode === "sign_in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) return null;
      if (error.code === "email_not_confirmed") {
        return { error: "Confirm your email before signing in.", unconfirmed: true };
      }
      return { error: error.message };
    }

    const passwordError = newPasswordError(password, confirm);
    if (passwordError) return { error: passwordError };
    if (!agreed) return { error: "Accept the Terms of Service and Privacy Policy to continue." };

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: authRedirectUrl("/login"),
        data: { legal_accepted_at: new Date().toISOString(), legal_version: LEGAL_VERSION },
      },
    });
    if (error) return { error: error.message };
    // With email confirmation on there's no session until the link is clicked.
    if (!data.session) setSentTo(email);
    return null;
  }, null);

  if (!sessionLoading && session) {
    const from = (location.state as { from?: Location } | null)?.from;
    return <Navigate to={from?.pathname ?? "/"} replace />;
  }

  if (sentTo) {
    return (
      <AuthLayout>
        <Card padding="lg">
          <h1 className="mb-3 text-base font-medium text-ink">Check your email</h1>
          <p className="mb-4 text-sm text-ink-dim">
            We sent a confirmation link to <span className="text-ink">{sentTo}</span>. Open it to
            finish creating your account.
          </p>
          <ResendConfirmation email={sentTo} />
        </Card>
        <p className="mt-4 text-center text-xs text-ink-faint">
          Already confirmed?{" "}
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setMode("sign_in");
              setPassword("");
            }}
            className="text-accent hover:underline"
          >
            Sign in
          </button>
        </p>
      </AuthLayout>
    );
  }

  const signUp = mode === "sign_up";
  // Only on the page load the email link landed on, not later in-app visits.
  const linkError = !result && location.key === "default" ? emailLinkError : null;

  return (
    <AuthLayout>
      <Card as="form" action={formAction} padding="lg" noValidate>
        <h1 className="mb-6 text-base font-medium text-ink">
          {signUp ? "Create your account" : "Sign in"}
        </h1>

        {linkError && (
          <p role="alert" className="mb-4 text-sm text-negative">
            {linkError} Sign in to get a new one sent.
          </p>
        )}

        <label className={authLabelClass} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={authInputClass}
        />

        <div className="mb-1 flex items-baseline justify-between">
          <label className="block text-xs text-ink-dim" htmlFor="password">
            Password
          </label>
          {!signUp && (
            <Link to="/forgot-password" className="text-xs text-accent hover:underline">
              Forgot password?
            </Link>
          )}
        </div>
        <input
          id="password"
          type="password"
          autoComplete={signUp ? "new-password" : "current-password"}
          required
          minLength={signUp ? MIN_PASSWORD_LENGTH : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={authInputClass}
        />

        {signUp && (
          <>
            <label className={authLabelClass} htmlFor="confirm-password">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={authInputClass}
            />

            <label className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-ink-dim">
              <input
                type="checkbox"
                required
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-accent"
              />
              <span>
                I agree to the{" "}
                <Link to="/terms" target="_blank" className="text-accent hover:underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/privacy" target="_blank" className="text-accent hover:underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
          </>
        )}

        {result && (
          <div role="alert" className="mb-4 text-sm text-negative">
            <p>{result.error}</p>
            {result.unconfirmed && <ResendConfirmation email={email} />}
          </div>
        )}

        <button type="submit" disabled={submitting} className={authButtonClass}>
          {submitting ? "One moment…" : signUp ? "Create account" : "Sign in"}
        </button>
      </Card>

      <p className="mt-4 text-center text-xs text-ink-faint">
        {signUp ? "Already have an account?" : "New here?"}{" "}
        <button
          type="button"
          onClick={() => setMode(signUp ? "sign_in" : "sign_up")}
          className="text-accent hover:underline"
        >
          {signUp ? "Sign in" : "Create an account"}
        </button>
      </p>
    </AuthLayout>
  );
}

/** Re-sends the sign-up confirmation email. A plain button rather than a
 * form, since it can render inside the sign-in form. Supabase rate-limits
 * resends, so a failure (usually "too many requests") is shown as-is. */
function ResendConfirmation({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | { error: string }>("idle");

  async function resend() {
    setState("sending");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: authRedirectUrl("/login") },
    });
    setState(error ? { error: error.message } : "sent");
  }

  if (state === "sent") {
    return <p className="mt-2 text-xs text-ink-dim">Sent — check your inbox (and spam folder).</p>;
  }
  return (
    <p className="mt-2 text-xs">
      <button
        type="button"
        onClick={resend}
        disabled={state === "sending"}
        className="text-accent hover:underline disabled:opacity-50"
      >
        {state === "sending" ? "Sending…" : "Resend confirmation email"}
      </button>
      {typeof state === "object" && <span className="ml-2 text-negative">{state.error}</span>}
    </p>
  );
}
