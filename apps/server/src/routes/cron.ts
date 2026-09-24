// Daily maintenance for the Vercel deployment, which has no pg-boss worker.
// Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`; without
// the secret configured the route doesn't exist.

import { Hono } from "hono";
import { env } from "../env";
import { cleanupExpired, connectedHevyUsers, runHevySyncExclusive } from "../jobs/maintenance";

export const cron = new Hono();

/** Stop starting new syncs with enough of the 300s function budget left for
 * the one in flight to finish. */
const SYNC_BUDGET_MS = 200_000;

cron.get("/daily", async (c) => {
  if (!env.CRON_SECRET || c.req.header("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const started = Date.now();
  await cleanupExpired();

  const users = await connectedHevyUsers();
  let synced = 0;
  let failed = 0;
  for (const userId of users) {
    if (Date.now() - started > SYNC_BUDGET_MS) break;
    try {
      if (await runHevySyncExclusive(userId)) synced++;
    } catch (e) {
      failed++;
      console.error(`[cron] hevy ${userId}`, e);
    }
  }
  return c.json({ users: users.length, synced, failed });
});
