import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { startBot } from "./bot";
import { env } from "./env";
import { startJobs } from "./jobs/boss";
import { api } from "./routes/api";
import { ingest } from "./routes/ingest";
import { telegramWebhook } from "./routes/telegram";

const app = new Hono();

app.use("*", logger());
app.use(
  "/api/*",
  cors({ origin: env.WEB_ORIGIN.split(","), allowHeaders: ["authorization", "content-type"] }),
);

app.get("/healthz", (c) => c.json({ ok: true }));
app.route("/api", api);
app.route("/ingest", ingest);
app.route("/telegram", telegramWebhook);

app.onError((err, c) => {
  console.error("[http]", err);
  return c.json({ error: "Something went wrong on our side." }, 500);
});

await startJobs();
await startBot();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`LiftLedger server on http://localhost:${info.port}`);
});
