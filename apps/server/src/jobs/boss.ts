// Background jobs on pg-boss (Postgres-backed, same database). Hevy syncs are
// one-per-user at a time ("stately" + singletonKey = user id), fanned out by
// a scheduled tick.

import { PgBoss } from "pg-boss";
import { env } from "../env";
import { runHevySync } from "../integrations/hevy/sync";
import { db, must, ok } from "../lib/db";

export const QUEUES = {
  hevySync: "hevy-sync",
  hevyTick: "hevy-tick",
  cleanup: "cleanup",
} as const;

export const boss = new PgBoss(env.DATABASE_URL);

export async function enqueueHevySync(userId: string): Promise<void> {
  await boss.send(
    QUEUES.hevySync,
    { userId },
    { singletonKey: userId, retryLimit: 3, retryDelay: 60, retryBackoff: true },
  );
}

export async function startJobs(): Promise<void> {
  boss.on("error", (e) => console.error("[jobs]", e));
  await boss.start();
  await boss.createQueue(QUEUES.hevySync, { policy: "stately" });
  await boss.createQueue(QUEUES.hevyTick, { policy: "singleton" });
  await boss.createQueue(QUEUES.cleanup, { policy: "singleton" });

  await boss.work<{ userId: string }>(QUEUES.hevySync, { localConcurrency: 3 }, async ([job]) => {
    if (!job) return;
    const summary = await runHevySync(job.data.userId);
    console.log(`[hevy] ${job.data.userId}`, summary);
  });

  await boss.work(QUEUES.hevyTick, async () => {
    const users = must(
      await db
        .from("integrations")
        .select("user_id")
        .eq("provider", "hevy")
        .eq("status", "connected"),
    );
    for (const { user_id } of users) await enqueueHevySync(user_id);
  });

  await boss.work(QUEUES.cleanup, async () => {
    const now = new Date().toISOString();
    const twoDaysAgo = new Date(Date.now() - 48 * 3600_000).toISOString();
    ok(await db.from("telegram_link_codes").delete().lt("expires_at", now));
    ok(await db.from("bot_messages").delete().lt("created_at", twoDaysAgo));
  });

  await boss.schedule(QUEUES.hevyTick, env.HEVY_SYNC_CRON);
  await boss.schedule(QUEUES.cleanup, "17 4 * * *");
}
