// Send a message to the bot as a user, without Telegram:
//   pnpm --filter @liftledger/server simulate --email dev@liftledger.test "2 eggs and toast"
//   pnpm --filter @liftledger/server simulate --email dev@liftledger.test --photo meal.jpg
// Writes to the database exactly like a real message (meals are logged).

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { respond } from "../src/bot/respond";
import { db } from "../src/lib/db";

const { values, positionals } = parseArgs({
  options: { email: { type: "string" }, photo: { type: "string" } },
  allowPositionals: true,
});

if (!values.email) {
  console.error("--email is required");
  process.exit(1);
}

const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
const user = data.users.find((u) => u.email === values.email);
if (!user) {
  console.error(`No user ${values.email}`);
  process.exit(1);
}

const image = values.photo ? new Uint8Array(await readFile(values.photo)) : null;
const started = Date.now();
const reply = await respond(user.id, {
  text: positionals.join(" ") || null,
  image,
  hasPhoto: image != null,
});
console.log(`[${reply.intent}] (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
console.log(reply.text.replace(/<\/?(b|i|s|code)>/g, ""));
process.exit(0);
