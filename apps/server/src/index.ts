// Long-running Node server: local dev and self-hosting. Background work runs
// on pg-boss and the Telegram bot long-polls (or sets its webhook).

import { serve } from "@hono/node-server";
import { app } from "./app";
import { startBot } from "./bot";
import { env } from "./env";
import { enqueueHevySync, startJobs } from "./jobs/boss";
import { setHevySyncDispatcher } from "./jobs/dispatch";

setHevySyncDispatcher(enqueueHevySync);
await startJobs();
await startBot();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`LiftLedger server on http://localhost:${info.port}`);
});
