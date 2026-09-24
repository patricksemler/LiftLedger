// Hevy → LiftLedger sync for one user. Resumable backfill through
// /v1/workouts, then incremental updates from /v1/workouts/events. Templates
// refresh daily and whenever a workout references one we haven't seen (a new
// custom exercise), fixing Phobos's "templates only cached once" gap.

import { db, maybe, must, ok } from "../../lib/db";
import { upsertIntegration } from "../../lib/integrations";
import { getSecret } from "../../lib/secrets";
import { HevyClient, HevyError, type HevyWorkout } from "./client";
import { setRows, templateRow, unknownTemplateIds, workoutRow } from "./normalize";

const TEMPLATE_REFRESH_MS = 24 * 60 * 60 * 1000;

export interface SyncSummary {
  workoutsUpserted: number;
  workoutsDeleted: number;
  templates: number;
  bodyMeasurements: number;
  backfillDone: boolean;
}

async function getState(userId: string) {
  const existing = maybe(
    await db.from("hevy_sync_state").select("*").eq("user_id", userId).maybeSingle(),
  );
  if (existing) return existing;
  return must(await db.from("hevy_sync_state").insert({ user_id: userId }).select("*").single());
}

async function saveState(
  userId: string,
  fields: Partial<{
    backfill_page: number;
    backfill_done: boolean;
    body_backfill_done: boolean;
    last_event_sync: string | null;
    templates_synced_at: string;
    last_run_at: string;
    last_error: string | null;
  }>,
) {
  ok(await db.from("hevy_sync_state").update(fields).eq("user_id", userId));
}

async function knownTemplateIds(userId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const rows = must(
      await db
        .from("exercise_templates")
        .select("id")
        .eq("user_id", userId)
        .range(from, from + 999),
    );
    for (const r of rows) ids.add(r.id);
    if (rows.length < 1000) return ids;
  }
}

async function refreshTemplates(userId: string, client: HevyClient): Promise<number> {
  let count = 0;
  for (let page = 1; ; page++) {
    const res = await client.templates(page);
    if (res.items.length > 0) {
      ok(await db.from("exercise_templates").upsert(res.items.map((t) => templateRow(userId, t))));
      count += res.items.length;
    }
    if (page >= res.page_count || res.items.length === 0) break;
  }
  await saveState(userId, { templates_synced_at: new Date().toISOString() });
  return count;
}

async function upsertWorkouts(userId: string, workouts: HevyWorkout[]): Promise<void> {
  if (workouts.length === 0) return;
  ok(await db.from("workouts").upsert(workouts.map((w) => workoutRow(userId, w))));
  const ids = workouts.map((w) => w.id);
  ok(await db.from("workout_sets").delete().eq("user_id", userId).in("workout_id", ids));
  const sets = workouts.flatMap((w) => setRows(userId, w));
  if (sets.length > 0) ok(await db.from("workout_sets").insert(sets));
}

export async function runHevySync(userId: string): Promise<SyncSummary> {
  const apiKey = await getSecret(userId, "hevy_api_key");
  if (!apiKey) throw new Error("No Hevy API key on file");
  const client = new HevyClient(apiKey);
  const startedAt = new Date().toISOString();
  const summary: SyncSummary = {
    workoutsUpserted: 0,
    workoutsDeleted: 0,
    templates: 0,
    bodyMeasurements: 0,
    backfillDone: false,
  };

  try {
    const state = await getState(userId);

    const templatesStale =
      !state.templates_synced_at ||
      Date.now() - new Date(state.templates_synced_at).getTime() > TEMPLATE_REFRESH_MS;
    if (templatesStale) summary.templates = await refreshTemplates(userId, client);
    let known = await knownTemplateIds(userId);

    const seen: HevyWorkout[] = [];

    if (!state.backfill_done) {
      // Resume from the page after the last one saved.
      for (let page = state.backfill_page + 1; ; page++) {
        const res = await client.workouts(page);
        await upsertWorkouts(userId, res.items);
        seen.push(...res.items);
        summary.workoutsUpserted += res.items.length;
        await saveState(userId, { backfill_page: page });
        if (page >= res.page_count || res.items.length === 0) break;
      }
      // Anything edited while the backfill ran is picked up by the events
      // feed from the moment the backfill started.
      await saveState(userId, { backfill_done: true, last_event_sync: startedAt });
    } else {
      const since = state.last_event_sync ?? new Date(0).toISOString();
      let watermark = since;
      for (let page = 1; ; page++) {
        const res = await client.events(since, page);
        const updated = res.items.flatMap((e) => (e.type === "updated" ? [e.workout] : []));
        const deleted = res.items.flatMap((e) => (e.type === "deleted" ? [e] : []));
        await upsertWorkouts(userId, updated);
        seen.push(...updated);
        summary.workoutsUpserted += updated.length;
        if (deleted.length > 0) {
          ok(
            await db
              .from("workouts")
              .delete()
              .eq("user_id", userId)
              .in(
                "id",
                deleted.map((d) => d.id),
              ),
          );
          summary.workoutsDeleted += deleted.length;
        }
        for (const w of updated)
          if (w.updated_at && w.updated_at > watermark) watermark = w.updated_at;
        for (const d of deleted)
          if (d.deleted_at && d.deleted_at > watermark) watermark = d.deleted_at;
        if (page >= res.page_count || res.items.length === 0) break;
      }
      await saveState(userId, { last_event_sync: watermark });
    }

    if (unknownTemplateIds(seen, known).length > 0) {
      summary.templates = await refreshTemplates(userId, client);
      known = await knownTemplateIds(userId);
    }

    summary.bodyMeasurements = await syncBodyMeasurements(userId, client, state.body_backfill_done);
    summary.backfillDone = true;

    const now = new Date().toISOString();
    await saveState(userId, { last_run_at: now, last_error: null });
    await upsertIntegration(userId, "hevy", {
      status: "connected",
      last_sync_at: now,
      last_error: null,
    });
    return summary;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await saveState(userId, { last_error: message, last_run_at: new Date().toISOString() });
    if (e instanceof HevyError && (e.status === 401 || e.status === 403)) {
      await upsertIntegration(userId, "hevy", { status: "error", last_error: message });
    }
    throw e;
  }
}

/** There's no events feed for body measurements: backfill every page once,
 * then re-read the newest page each run. */
async function syncBodyMeasurements(
  userId: string,
  client: HevyClient,
  backfillDone: boolean,
): Promise<number> {
  let count = 0;
  for (let page = 1; ; page++) {
    const res = await client.bodyMeasurements(page);
    const rows = res.items
      .filter((m) => m.weight_kg != null || m.fat_percent != null)
      .map((m) => ({
        user_id: userId,
        date: m.date,
        source: "hevy",
        weight_kg: m.weight_kg,
        fat_percent: m.fat_percent,
        synced_at: new Date().toISOString(),
      }));
    if (rows.length > 0) ok(await db.from("body_measurements").upsert(rows));
    count += rows.length;
    if (backfillDone || page >= res.page_count || res.items.length === 0) break;
  }
  if (!backfillDone) {
    ok(await db.from("hevy_sync_state").update({ body_backfill_done: true }).eq("user_id", userId));
  }
  return count;
}
