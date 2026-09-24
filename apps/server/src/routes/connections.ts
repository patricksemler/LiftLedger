import { aiProviderKindSchema } from "@liftledger/shared";
import { Hono } from "hono";
import { z } from "zod";
import { type AiConfig, buildModel, checkBaseUrl, probeModel } from "../ai/provider";
import { env } from "../env";
import { HevyClient, HevyError } from "../integrations/hevy/client";
import { requestHevySync } from "../jobs/dispatch";
import type { AuthVars } from "../lib/auth";
import { randomToken, sha256 } from "../lib/crypto";
import { db, ok } from "../lib/db";
import { getIntegration, upsertIntegration } from "../lib/integrations";
import { deleteSecret, getSecret, last4, putSecret } from "../lib/secrets";

export const connections = new Hono<AuthVars>();

const hevyBody = z.object({ apiKey: z.string().trim().min(10).max(200) });

connections.post("/hevy", async (c) => {
  const parsed = hevyBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Paste your Hevy API key." }, 400);
  const userId = c.get("userId");
  const { apiKey } = parsed.data;

  let workoutCount: number;
  try {
    workoutCount = await new HevyClient(apiKey, fetch, 0).workoutCount();
  } catch (e) {
    const status = e instanceof HevyError && e.status === 401 ? 400 : 502;
    return c.json({ error: e instanceof Error ? e.message : "Couldn't reach Hevy." }, status);
  }

  const previous = await getSecret(userId, "hevy_api_key");
  await putSecret(userId, "hevy_api_key", apiKey);
  // A different key may be a different Hevy account: start over cleanly.
  if (previous && previous !== apiKey) {
    ok(await db.from("hevy_sync_state").delete().eq("user_id", userId));
  }
  await upsertIntegration(userId, "hevy", {
    status: "connected",
    secret_last4: last4(apiKey),
    last_error: null,
  });
  await requestHevySync(userId);
  return c.json({ workoutCount });
});

const aiBody = z.object({
  kind: aiProviderKindSchema,
  model: z.string().trim().min(1).max(200),
  baseUrl: z.string().trim().max(500).optional(),
  apiKey: z.string().trim().max(500).optional(),
});

connections.post("/ai", async (c) => {
  const parsed = aiBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Pick a provider and a model." }, 400);
  const userId = c.get("userId");
  const { kind, model, apiKey } = parsed.data;

  let base_url: string | null = null;
  try {
    if (kind === "codex_cli") {
      if (!env.CODEX_CLI_ENABLED)
        return c.json({ error: "Codex CLI isn't enabled on this server." }, 400);
    } else if (kind === "openai_compatible") {
      if (!parsed.data.baseUrl) return c.json({ error: "A base URL is required." }, 400);
      base_url = checkBaseUrl(parsed.data.baseUrl);
    } else if (!apiKey) {
      // Re-saving with a blank key keeps the stored one.
      if (!(await getSecret(userId, "ai_api_key"))) {
        return c.json({ error: "An API key is required." }, 400);
      }
    }
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }

  const key = kind === "codex_cli" ? null : apiKey || (await getSecret(userId, "ai_api_key"));
  const config: AiConfig = { kind, model, base_url };
  let capabilities: { supports_tools: boolean; supports_vision: boolean };
  try {
    capabilities = await probeModel(buildModel(config, key));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: `The model didn't answer: ${message.slice(0, 300)}` }, 400);
  }

  if (kind === "codex_cli") await deleteSecret(userId, "ai_api_key");
  else if (apiKey) await putSecret(userId, "ai_api_key", apiKey);
  else if (kind === "openai_compatible" && !key) await deleteSecret(userId, "ai_api_key");
  await upsertIntegration(userId, "ai", {
    status: "connected",
    config: { ...config, ...capabilities },
    secret_last4: key ? last4(key) : null,
    last_error: null,
  });
  return c.json({ capabilities });
});

connections.delete("/ai", async (c) => {
  const userId = c.get("userId");
  await deleteSecret(userId, "ai_api_key");
  await upsertIntegration(userId, "ai", { status: "disconnected", secret_last4: null });
  return c.json({ ok: true });
});

connections.post("/telegram/link", async (c) => {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_BOT_USERNAME) {
    return c.json({ error: "The Telegram bot isn't configured on this server." }, 503);
  }
  const userId = c.get("userId");
  const code = randomToken(18);
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  ok(
    await db
      .from("telegram_link_codes")
      .insert({ code_hash: sha256(code), user_id: userId, expires_at: expiresAt }),
  );
  return c.json({ url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${code}`, expiresAt });
});

connections.post("/apple-health/token", async (c) => {
  const userId = c.get("userId");
  const token = randomToken(32);
  ok(
    await db.from("health_ingest_tokens").upsert({
      user_id: userId,
      token_hash: sha256(token),
      created_at: new Date().toISOString(),
      last_used_at: null,
    }),
  );
  const existing = await getIntegration(userId, "apple_health");
  await upsertIntegration(userId, "apple_health", {
    status: "connected",
    last_sync_at: existing?.last_sync_at ?? null,
    last_error: null,
  });
  return c.json({ token, url: `${env.PUBLIC_BASE_URL}/ingest/health` });
});

connections.delete("/apple-health", async (c) => {
  const userId = c.get("userId");
  ok(await db.from("health_ingest_tokens").delete().eq("user_id", userId));
  await upsertIntegration(userId, "apple_health", { status: "disconnected" });
  return c.json({ ok: true });
});
