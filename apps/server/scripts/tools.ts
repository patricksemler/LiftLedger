// Run a Q&A tool directly (no model), to check what the bot would see:
//   pnpm --filter @liftledger/server tools --email dev@liftledger.test get_muscle_progress '{"muscle":"biceps","weeks":6}'

import { parseArgs } from "node:util";
import { buildTools } from "../src/bot/agent/tools";
import { loadUserContext } from "../src/bot/context";
import { db } from "../src/lib/db";

const { values, positionals } = parseArgs({
  options: { email: { type: "string" } },
  allowPositionals: true,
});
const [name, json] = positionals;
const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
const user = data.users.find((u) => u.email === values.email);
if (!user || !name) {
  console.error("usage: tools --email <email> <tool_name> '<json input>'");
  process.exit(1);
}
const tools = buildTools(await loadUserContext(user.id)) as unknown as Record<
  string,
  { execute?: (input: unknown, options: unknown) => Promise<unknown> }
>;
const t = tools[name];
if (!t?.execute) {
  console.error(`Unknown tool ${name}. Tools: ${Object.keys(tools).join(", ")}`);
  process.exit(1);
}
const out = await t.execute(JSON.parse(json ?? "{}"), { toolCallId: "cli", messages: [] });
console.log(JSON.stringify(out, null, 2));
process.exit(0);
