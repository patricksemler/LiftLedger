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

export const supabase = createClient<Database>(url, anonKey);
