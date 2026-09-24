// Service-role Supabase client. It bypasses RLS, so every query in the server
// MUST filter by user_id explicitly — helpers here take userId as their first
// argument to make that the path of least resistance.

import type { Database } from "@liftledger/shared";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { env } from "../env";

export type Db = SupabaseClient<Database>;

export const db: Db = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type AnyResult = { data: unknown; error: { message: string } | null };
/** The data type of a PostgREST response's success branch. */
type Data<R> = R extends { error: null; data: infer D } ? D : never;

/** Throws on a PostgREST error and returns the (non-null) data — for
 * selects, `.single()` and RPCs. */
export function must<R extends AnyResult>(result: R): NonNullable<Data<R>> {
  if (result.error) throw new Error(result.error.message);
  if (result.data == null) throw new Error("Query returned no data");
  return result.data as NonNullable<Data<R>>;
}

/** Like `must`, for `.maybeSingle()`: null means "no row". */
export function maybe<R extends AnyResult>(result: R): Data<R> | null {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? null) as Data<R> | null;
}

/** For writes without `.select()`: throws on error, returns nothing. */
export function ok(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}
