import { useActionState, useState } from "react";
import { Link } from "react-router";
import {
  AuthLayout,
  authButtonClass,
  authInputClass,
  authLabelClass,
} from "../components/AuthLayout";
import { Card } from "../components/Card";
import { authRedirectUrl, supabase } from "../lib/supabase";

/** Requests a password-reset email. The link signs the user in with a
 * recovery session and lands on /reset-password to choose a new one. The
 * success message is the same whether or not the address has an account. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");

  const [result, formAction, submitting] = useActionState<
    { error: string } | { sent: string } | null
  >(async () => {
    if (!email.trim()) return { error: "Enter the email you signed up with." };
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirectUrl("/reset-password"),
    });
    return error ? { error: error.message } : { sent: email.trim() };
  }, null);

  return (
    <AuthLayout>
      {result && "sent" in result ? (
        <Card padding="lg">
          <h1 className="mb-3 text-base font-medium text-ink">Check your email</h1>
          <p className="text-sm text-ink-dim">
            If <span className="text-ink">{result.sent}</span> has a LiftLedger account, we've sent
            it a link to reset your password. The link expires in an hour.
          </p>
        </Card>
      ) : (
        <Card as="form" action={formAction} padding="lg" noValidate>
          <h1 className="mb-2 text-base font-medium text-ink">Reset your password</h1>
          <p className="mb-6 text-sm text-ink-dim">
            Enter your account's email and we'll send you a reset link.
          </p>

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

          {result && "error" in result && (
            <p role="alert" className="mb-4 text-sm text-negative">
              {result.error}
            </p>
          )}

          <button type="submit" disabled={submitting} className={authButtonClass}>
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </Card>
      )}

      <p className="mt-4 text-center text-xs text-ink-faint">
        <Link to="/login" className="text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
