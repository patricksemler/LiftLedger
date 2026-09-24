// Serverless entry point, bundled into a Vercel Node function by
// scripts/build-vercel.mjs. There's no worker process: Hevy syncs run after
// the response via `waitUntil`, one per user at a time under a database
// lease, and routes/cron.ts covers the scheduled work once a day. The
// Telegram bot is webhook-only here.

import { getRequestListener } from "@hono/node-server";
import { app } from "./app";
import { setHevySyncDispatcher } from "./jobs/dispatch";
import { runHevySyncExclusive } from "./jobs/maintenance";
import { background } from "./lib/background";

setHevySyncDispatcher(async (userId) => {
  background("hevy", runHevySyncExclusive(userId));
});

export default getRequestListener(app.fetch);
