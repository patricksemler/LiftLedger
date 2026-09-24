import { webhookCallback } from "grammy";
import { Hono } from "hono";
import { bot } from "../bot";
import { env } from "../env";

export const telegramWebhook = new Hono();

if (bot && env.TELEGRAM_MODE === "webhook") {
  telegramWebhook.post(
    "/webhook",
    webhookCallback(bot, "hono", { secretToken: env.TELEGRAM_WEBHOOK_SECRET }),
  );
}
