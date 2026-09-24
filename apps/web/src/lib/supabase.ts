// Browser Supabase client. Uses the anon key only — RLS (owner_all policies,
// see supabase/migrations) protects every row. Never import a service-role
// key here.

import type { Database } from "@liftledger/shared";
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Check apps/web/.env " +
      "(copy apps/web/.env.example and fill in real values).",
  );
}

/** Error from an email link (expired/used confirmation or reset link), read
 * before the client consumes the URL. Supabase redirects back with it in the
 * hash, e.g. `#error=access_denied&error_code=otp_expired&error_description=…`. */
export const emailLinkError: string | null = (() => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (!params.get("error")) return null;
  return params.get("error_code") === "otp_expired"
    ? "That email link is invalid or has expired."
    : (params.get("error_description") ?? "That email link didn't work.");
})();

export const supabase = createClient<Database>(url, anonKey);

/** Where email links (sign-up confirmation, password reset) send the user
 * back to. Must be on the project's Auth redirect allow-list. */
export function authRedirectUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}
