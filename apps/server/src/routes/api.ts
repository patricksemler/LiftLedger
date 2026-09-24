import { Hono } from "hono";
import { searchFoods } from "../foods/search";
import { enqueueHevySync } from "../jobs/boss";
import { type AuthVars, requireUser } from "../lib/auth";
import { getIntegration } from "../lib/integrations";
import { connections } from "./connections";

export const api = new Hono<AuthVars>();

api.use("*", requireUser);
api.route("/connections", connections);

api.post("/hevy/sync", async (c) => {
  const userId = c.get("userId");
  if (!(await getIntegration(userId, "hevy"))) {
    return c.json({ error: "Connect Hevy first." }, 400);
  }
  await enqueueHevySync(userId);
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
