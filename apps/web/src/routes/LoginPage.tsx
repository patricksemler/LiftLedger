import { useActionState, useState } from "react";
import { type Location, Navigate, useLocation } from "react-router";
import { Card } from "../components/Card";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

type Mode = "sign_in" | "sign_up";

const inputClass =
  "mb-4 w-full rounded-md border border-border bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus-visible:border-accent";

export function LoginPage() {
  const { session, loading: sessionLoading } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>("sign_in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, formAction, submitting] = useActionState<{
    error?: string;
    info?: string;
  } | null>(async () => {
    if (mode === "sign_in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? { error: error.message } : null;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name.trim() || undefined } },
    });
    if (error) return { error: error.message };
    if (!data.session) return { info: "Check your email to confirm your account, then sign in." };
    return null;
  }, null);

  if (!sessionLoading && session) {
    const from = (location.state as { from?: Location } | null)?.from;
    return <Navigate to={from?.pathname ?? "/"} replace />;
  }

  const signUp = mode === "sign_up";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-0 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-2 flex items-center justify-center gap-2">
          <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
          <span className="font-mono text-sm font-medium tracking-[0.2em] text-ink">
            LIFTLEDGER
          </span>
        </div>
        <p className="mb-8 text-center text-xs text-ink-faint">
          Your training, nutrition and health in one ledger.
        </p>

        <Card as="form" action={formAction} padding="lg" noValidate>
          <h1 className="mb-6 text-base font-medium text-ink">
            {signUp ? "Create your account" : "Sign in"}
          </h1>

          {signUp && (
            <>
              <label className="mb-1 block text-xs text-ink-dim" htmlFor="name">
                Name
              </label>
              <input
                id="name"
                autoComplete="given-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </>
          )}

          <label className="mb-1 block text-xs text-ink-dim" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />

          <label className="mb-1 block text-xs text-ink-dim" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete={signUp ? "new-password" : "current-password"}
            required
            minLength={signUp ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />

          {message?.error && (
            <p role="alert" className="mb-4 text-sm text-negative">
              {message.error}
            </p>
          )}
          {message?.info && <p className="mb-4 text-sm text-ink-dim">{message.info}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
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
      </div>
    </div>
  );
}
