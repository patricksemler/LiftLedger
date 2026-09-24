import { useActionState, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
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
import { emailLinkError, supabase } from "../lib/supabase";

/** Landing page for the password-reset email. Supabase's client picks the
 * recovery session up from the URL, so by the time auth has loaded the user
 * is signed in and only needs to pick a new password. Without a session the
 * link was invalid, expired or already used. */
export function ResetPasswordPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [error, formAction, submitting] = useActionState<string | null>(async () => {
    const invalid = newPasswordError(password, confirm);
    if (invalid) return invalid;
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return error.message;
    navigate("/", { replace: true });
    return null;
  }, null);

  if (loading) {
    return (
      <AuthLayout>
        <p className="text-center text-sm text-ink-faint">Loading…</p>
      </AuthLayout>
    );
  }

  if (!session) {
    const linkError = location.key === "default" ? emailLinkError : null;
    return (
      <AuthLayout>
        <Card padding="lg">
          <h1 className="mb-3 text-base font-medium text-ink">Reset link not valid</h1>
          <p className="mb-4 text-sm text-ink-dim">
            {linkError ?? "This page needs a password-reset link from your email."} Reset links
            expire after an hour and can only be used once.
          </p>
          <Link to="/forgot-password" className={`${authButtonClass} inline-block text-center`}>
            Send a new link
          </Link>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Card as="form" action={formAction} padding="lg" noValidate>
        <h1 className="mb-2 text-base font-medium text-ink">Choose a new password</h1>
        <p className="mb-6 text-sm text-ink-dim">
          For <span className="text-ink">{session.user.email}</span>
        </p>

        <label className={authLabelClass} htmlFor="password">
          New password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={authInputClass}
        />

        <label className={authLabelClass} htmlFor="confirm-password">
          Confirm new password
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

        {error && (
          <p role="alert" className="mb-4 text-sm text-negative">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className={authButtonClass}>
          {submitting ? "Saving…" : "Update password"}
        </button>
      </Card>
    </AuthLayout>
  );
}
