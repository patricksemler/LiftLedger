// Health Auto Export pushes here with `Authorization: Bearer <token>`. We
// always answer 200 with counts once authenticated, so a partially odd
// payload doesn't make the phone retry the same export forever.

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { parseHealthPayload } from "../health/parse";
import { sha256 } from "../lib/crypto";
import { db, maybe, ok } from "../lib/db";
import { upsertIntegration } from "../lib/integrations";

export const ingest = new Hono();

ingest.post(
  "/health",
  bodyLimit({
    maxSize: 50 * 1024 * 1024,
    onError: (c) => c.json({ error: "Payload too large — turn on Batch Requests." }, 413),
  }),
  async (c) => {
    const header = c.req.header("authorization") ?? c.req.header("x-api-key") ?? "";
    const token = header.replace(/^Bearer\s+/i, "").trim();
    if (!token) return c.json({ error: "Missing token" }, 401);
    const row = maybe(
      await db
        .from("health_ingest_tokens")
        .select("user_id")
        .eq("token_hash", sha256(token))
        .maybeSingle(),
    );
    if (!row) return c.json({ error: "Unknown token" }, 401);
    const userId = row.user_id;

    const body = await c.req.json().catch(() => null);
    const parsed = parseHealthPayload(body);
    const now = new Date().toISOString();

    if (parsed.daily.length > 0) {
      ok(
        await db
          .from("health_daily")
          .upsert(parsed.daily.map((d) => ({ user_id: userId, ...d, synced_at: now }))),
      );
    }
    if (parsed.weights.length > 0) {
      ok(
        await db.from("body_measurements").upsert(
          parsed.weights.map((w) => ({
            user_id: userId,
            source: "apple_health",
            ...w,
            synced_at: now,
          })),
        ),
      );
    }
    ok(await db.from("health_ingest_tokens").update({ last_used_at: now }).eq("user_id", userId));
    await upsertIntegration(userId, "apple_health", {
      status: "connected",
      last_sync_at: now,
      last_error: null,
    });

    return c.json({
      ok: true,
      days: parsed.daily.length,
      weighIns: parsed.weights.length,
      ignored: parsed.ignored,
    });
  },
);
