import { Hono } from "hono";
import { bot } from "../bot";
import { env } from "../env";
import { background } from "../lib/background";

export const telegramWebhook = new Hono();

let ready: Promise<void> | null = null;

// Acknowledge first, then handle. A food log can spend well over ten seconds
// in the model, and Telegram re-sends any update it doesn't see answered
// promptly — which would log the same meal twice.
telegramWebhook.post("/webhook", async (c) => {
  if (!bot || env.TELEGRAM_MODE !== "webhook") return c.notFound();
  const secret = c.req.header("x-telegram-bot-api-secret-token");
  if (!env.TELEGRAM_WEBHOOK_SECRET || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const update = await c.req.json();
  ready ??= bot.init().catch((e) => {
    ready = null;
    throw e;
  });
  await ready;
  background("telegram", bot.handleUpdate(update));
  return c.json({ ok: true });
});
