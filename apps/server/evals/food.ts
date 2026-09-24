// Food-logging eval against the model a user has connected. Parses and
// resolves each case (nothing is saved) and checks totals against expected
// ranges. Usage:
//   pnpm --filter @liftledger/server eval:food --email dev@liftledger.test

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { getUserModel } from "../src/ai/provider";
import { parseFood } from "../src/bot/food/parse";
import { resolveItems } from "../src/bot/food/resolve";
import { db } from "../src/lib/db";

interface Case {
  text: string;
  kcal: [number, number];
  protein: [number, number];
}

const { values } = parseArgs({ options: { email: { type: "string" } } });
const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
const user = data.users.find((u) => u.email === values.email);
if (!user) throw new Error(`No user ${values.email}`);
const ai = await getUserModel(user.id);
if (!ai) throw new Error("That user has no AI model connected");

const cases = JSON.parse(
  await readFile(new URL("./food-cases.json", import.meta.url), "utf8"),
) as Case[];
// Allow 15% slack past each range edge — reference values legitimately vary.
const within = (v: number, [lo, hi]: [number, number]) => v >= lo * 0.85 - 1 && v <= hi * 1.15 + 1;

let passed = 0;
for (const c of cases) {
  const started = Date.now();
  try {
    const parsed = await parseFood(user.id, ai.model, {
      text: c.text,
      image: null,
      today: "2026-01-01",
    });
    const items = await resolveItems(user.id, ai.model, parsed.items, c.text);
    const kcal = items.reduce((a, i) => a + i.calories, 0);
    const protein = items.reduce((a, i) => a + i.protein_g, 0);
    const ok = within(kcal, c.kcal) && within(protein, c.protein);
    if (ok) passed++;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${c.text}\n      ${Math.round(kcal)} kcal (want ${c.kcal.join("–")}), ${Math.round(protein)} g P (want ${c.protein.join("–")}) · ${items.map((i) => i.label).join(", ")} · ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
  } catch (e) {
    console.log(`ERROR ${c.text}: ${(e as Error).message}`);
  }
}
console.log(`\n${passed}/${cases.length} passed with ${ai.config.kind} ${ai.config.model}`);
process.exit(0);
