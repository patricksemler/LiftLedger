// The HTTP app, shared by both entry points: index.ts (long-running Node
// server with pg-boss and Telegram polling) and vercel.ts (serverless).

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env";
import { api } from "./routes/api";
import { cron } from "./routes/cron";
import { ingest } from "./routes/ingest";
import { telegramWebhook } from "./routes/telegram";

export const app = new Hono();

app.use("*", logger());
app.use(
  "/api/*",
  cors({ origin: env.WEB_ORIGIN.split(","), allowHeaders: ["authorization", "content-type"] }),
);

app.get("/healthz", (c) => c.json({ ok: true }));
app.route("/api", api);
app.route("/ingest", ingest);
app.route("/telegram", telegramWebhook);
app.route("/cron", cron);

app.onError((err, c) => {
  console.error("[http]", err);
  return c.json({ error: "Something went wrong on our side." }, 500);
});
