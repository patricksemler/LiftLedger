// Background jobs on pg-boss (Postgres-backed, same database) for the
// long-running Node server. Hevy syncs are one-per-user at a time ("stately"
// + singletonKey = user id), fanned out by a scheduled tick. The Vercel
// deployment has no worker process and uses routes/cron.ts instead.

import { PgBoss } from "pg-boss";
import { env } from "../env";
import { runHevySync } from "../integrations/hevy/sync";
import { cleanupExpired, connectedHevyUsers } from "./maintenance";

export const QUEUES = {
  hevySync: "hevy-sync",
  hevyTick: "hevy-tick",
  cleanup: "cleanup",
} as const;

let boss: PgBoss | null = null;

export async function enqueueHevySync(userId: string): Promise<void> {
  if (!boss) throw new Error("Jobs not started");
  await boss.send(
    QUEUES.hevySync,
    { userId },
    { singletonKey: userId, retryLimit: 3, retryDelay: 60, retryBackoff: true },
  );
}

export async function startJobs(): Promise<void> {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required to run background jobs");
  const b = new PgBoss(env.DATABASE_URL);
  boss = b;
  b.on("error", (e) => console.error("[jobs]", e));
  await b.start();
  await b.createQueue(QUEUES.hevySync, { policy: "stately" });
  await b.createQueue(QUEUES.hevyTick, { policy: "singleton" });
  await b.createQueue(QUEUES.cleanup, { policy: "singleton" });

  await b.work<{ userId: string }>(QUEUES.hevySync, { localConcurrency: 3 }, async ([job]) => {
    if (!job) return;
    const summary = await runHevySync(job.data.userId);
    console.log(`[hevy] ${job.data.userId}`, summary);
  });

  await b.work(QUEUES.hevyTick, async () => {
    for (const userId of await connectedHevyUsers()) await enqueueHevySync(userId);
  });

  await b.work(QUEUES.cleanup, cleanupExpired);

  await b.schedule(QUEUES.hevyTick, env.HEVY_SYNC_CRON);
  await b.schedule(QUEUES.cleanup, "17 4 * * *");
}
