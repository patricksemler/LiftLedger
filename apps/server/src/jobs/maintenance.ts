// Work shared by both schedulers: pg-boss's cron queues on the Node server
// and the daily Vercel cron route (routes/cron.ts).

import { runHevySync } from "../integrations/hevy/sync";
import type { SyncSummary } from "../integrations/hevy/sync";
import { db, must, ok } from "../lib/db";

export async function connectedHevyUsers(): Promise<string[]> {
  const rows = must(
    await db
      .from("integrations")
      .select("user_id")
      .eq("provider", "hevy")
      .eq("status", "connected"),
  );
  return rows.map((r) => r.user_id);
}

export async function cleanupExpired(): Promise<void> {
  const now = new Date().toISOString();
  const twoDaysAgo = new Date(Date.now() - 48 * 3600_000).toISOString();
  ok(await db.from("telegram_link_codes").delete().lt("expires_at", now));
  ok(await db.from("bot_messages").delete().lt("created_at", twoDaysAgo));
}

/** Matches the Vercel function's maxDuration: a run killed at the limit has
 * already saved its backfill progress, and the next one resumes once this
 * lapses. */
const LEASE_MS = 300_000;

/** Runs a Hevy sync unless one is already running for this user — the
 * serverless stand-in for pg-boss's one-per-user `stately` queue. Returns
 * null when another run holds the lease. */
export async function runHevySyncExclusive(userId: string): Promise<SyncSummary | null> {
  ok(
    await db
      .from("hevy_sync_state")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true }),
  );
  const now = new Date();
  const claimed = must(
    await db
      .from("hevy_sync_state")
      .update({ sync_lease_until: new Date(now.getTime() + LEASE_MS).toISOString() })
      .eq("user_id", userId)
      .or(`sync_lease_until.is.null,sync_lease_until.lt.${now.toISOString()}`)
      .select("user_id"),
  );
  if (claimed.length === 0) return null;
  try {
    return await runHevySync(userId);
  } finally {
    ok(await db.from("hevy_sync_state").update({ sync_lease_until: null }).eq("user_id", userId));
  }
}
