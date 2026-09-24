import { Hono } from "hono";
import { z } from "zod";
import { searchFoods } from "../foods/search";
import { requestHevySync } from "../jobs/dispatch";
import { type AuthVars, requireUser } from "../lib/auth";
import { db, maybe } from "../lib/db";
import { getIntegration } from "../lib/integrations";
import { connections } from "./connections";

export const api = new Hono<AuthVars>();

api.use("*", requireUser);
api.route("/connections", connections);

const syncBody = z.object({ ifStaleMinutes: z.number().int().positive().optional() });

api.post("/hevy/sync", async (c) => {
  const userId = c.get("userId");
  if (!(await getIntegration(userId, "hevy"))) {
    return c.json({ error: "Connect Hevy first." }, 400);
  }
  // The dashboard asks on open with `ifStaleMinutes`; the Sync button doesn't.
  const { ifStaleMinutes } = syncBody.parse((await c.req.json().catch(() => null)) ?? {});
  if (ifStaleMinutes) {
    const state = maybe(
      await db
        .from("hevy_sync_state")
        .select("last_run_at, backfill_done")
        .eq("user_id", userId)
        .maybeSingle(),
    );
    const fresh =
      state?.backfill_done &&
      state.last_run_at &&
      Date.now() - new Date(state.last_run_at).getTime() < ifStaleMinutes * 60_000;
    if (fresh) return c.json({ queued: false });
  }
  await requestHevySync(userId);
  return c.json({ queued: true });
});

api.get("/foods/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) return c.json({ results: [] });
  const results = await searchFoods(q, { limit: 12 });
  return c.json({
    results: results.map(({ per100g: _per100g, ...r }) => r),
  });
});
