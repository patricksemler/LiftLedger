// Food messages end to end: parse → resolve → validate → save → reply.

import { type LanguageModel, Output, generateText } from "ai";
import { db, maybe, must, ok } from "../../lib/db";
import { logAiCall } from "../ai-log";
import type { UserContext } from "../context";
import { esc, itemLine, todayLine, totalsLine } from "../format";
import { parseFood } from "./parse";
import { type ResolvedItem, mealConfidence, resolveItems } from "./resolve";
import { type EditOps, editSchema } from "./schema";
import { itemWarnings } from "./validate";

export interface FoodReply {
  text: string;
  mealId: string | null;
}

function sum(items: { calories: number; protein_g: number; carbs_g: number; fat_g: number }[]) {
  return items.reduce(
    (a, i) => ({
      calories: a.calories + i.calories,
      protein_g: a.protein_g + i.protein_g,
      carbs_g: a.carbs_g + i.carbs_g,
      fat_g: a.fat_g + i.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function toRpcItems(items: ResolvedItem[]) {
  return items.map((i) => ({
    name: i.name,
    brand: i.brand,
    quantity: i.quantity,
    unit: i.unit,
    grams: i.grams != null ? Math.round(i.grams) : null,
    calories: round1(i.calories),
    protein_g: round1(i.protein_g),
    carbs_g: round1(i.carbs_g),
    fat_g: round1(i.fat_g),
    fiber_g: round1(i.fiber_g),
    match_source: i.match_source,
    match_ref: i.match_ref,
  }));
}

function parseEatenAt(hint: string | null): string | null {
  if (!hint) return null;
  const d = new Date(hint);
  const age = Date.now() - d.getTime();
  // Only accept times in the last 3 days — anything else is a misparse.
  return Number.isFinite(d.getTime()) && age > -3600_000 && age < 3 * 86400_000
    ? d.toISOString()
    : null;
}

export async function logFoodMessage(
  ctx: UserContext,
  model: LanguageModel,
  input: { text: string | null; image: Uint8Array | null },
): Promise<FoodReply> {
  const parsed = await parseFood(ctx.userId, model, { ...input, today: ctx.today });
  if (!parsed.is_food || parsed.items.length === 0) {
    return {
      text: input.image
        ? "I couldn't spot any food in that photo. Add a caption like “chicken, rice and broccoli” and I'll log it."
        : "I didn't catch any food there. Try something like “2 eggs and a slice of toast”.",
      mealId: null,
    };
  }

  const items = await resolveItems(ctx.userId, model, parsed.items, input.text);
  const warnings = [...new Set(items.flatMap((i) => itemWarnings({ ...i })))];
  const mealId = must(
    await db.rpc("log_meal", {
      p_user_id: ctx.userId,
      p_title: parsed.title,
      // biome-ignore lint/suspicious/noExplicitAny: jsonb
      p_items: toRpcItems(items) as any,
      p_eaten_at: parseEatenAt(parsed.eaten_at_hint) ?? new Date().toISOString(),
      p_source: input.image ? "tg_photo" : "tg_text",
      p_confidence: mealConfidence(items),
      p_raw_text: input.text ?? undefined,
      // biome-ignore lint/suspicious/noExplicitAny: jsonb
      p_parse: parsed as any,
    }),
  );

  const total = sum(items);
  const after = {
    ...ctx,
    todayTotals: { ...ctx.todayTotals, ...addTotals(ctx.todayTotals, total) },
  };
  const lines = [
    `✅ Logged <b>${esc(parsed.title)}</b>`,
    ...items.map((i) => itemLine(i)),
    totalsLine(total),
    "",
    todayLine(after),
  ];
  if (warnings.length > 0) {
    lines.push(
      "",
      ...warnings.map((w) => `⚠️ ${esc(w)}`),
      "<i>Logged as you said — tap Edit to change it.</i>",
    );
  }
  if (mealConfidence(items) === "low") {
    lines.push(
      "",
      "<i>Some of this is a rough estimate. Weights or a label photo make it exact.</i>",
    );
  }
  return { text: lines.join("\n"), mealId };
}

function addTotals(
  a: { calories: number; protein_g: number; carbs_g: number; fat_g: number },
  b: { calories: number; protein_g: number; carbs_g: number; fat_g: number },
) {
  return {
    calories: a.calories + b.calories,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    fat_g: a.fat_g + b.fat_g,
  };
}

// --- edits -------------------------------------------------------------------

type MealWithItems = NonNullable<UserContext["lastMeal"]>;

export async function scaleMeal(
  userId: string,
  meal: MealWithItems,
  factor: number,
): Promise<void> {
  for (const i of meal.meal_items) {
    ok(
      await db
        .from("meal_items")
        .update({
          quantity: i.quantity != null ? i.quantity * factor : null,
          grams: i.grams != null ? Math.round(i.grams * factor) : null,
          calories: round1(i.calories * factor),
          protein_g: round1(i.protein_g * factor),
          carbs_g: round1(i.carbs_g * factor),
          fat_g: round1(i.fat_g * factor),
          fiber_g: round1(i.fiber_g * factor),
        })
        .eq("id", i.id)
        .eq("user_id", userId),
    );
  }
}

export async function getMeal(userId: string, mealId: string): Promise<MealWithItems | null> {
  const meal = maybe(
    await db
      .from("meals")
      .select("*, meal_items(*)")
      .eq("id", mealId)
      .eq("user_id", userId)
      .maybeSingle(),
  );
  return meal
    ? { ...meal, meal_items: [...meal.meal_items].sort((a, b) => a.position - b.position) }
    : null;
}

export function mealSummary(meal: MealWithItems): string {
  return [
    `<b>${esc(meal.title)}</b>`,
    ...meal.meal_items.map((i) => itemLine(i)),
    totalsLine(meal),
  ].join("\n");
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .match(/[a-z]{3,}/g)
      ?.filter((w) => !STOP.has(w)) ?? [],
  );
const STOP = new Set([
  "the",
  "and",
  "was",
  "that",
  "actually",
  "also",
  "with",
  "some",
  "had",
  "cup",
  "cups",
  "servings",
  "serving",
]);

/** Drops operations the correction doesn't support: added foods must share a
 * word with what the user wrote. */
export function sanitizeOps(ops: EditOps["operations"], correction: string): EditOps["operations"] {
  const said = words(correction);
  return ops.filter((op) => op.op !== "add_items" || [...words(op.text)].some((w) => said.has(w)));
}

export async function editLastMeal(
  ctx: UserContext,
  model: LanguageModel,
  text: string,
): Promise<FoodReply> {
  const meal = ctx.lastMeal;
  if (!meal)
    return {
      text: "There's no recent meal to change. Tell me what you ate and I'll log it.",
      mealId: null,
    };

  const started = Date.now();
  const listing = meal.meal_items
    .map(
      (i, idx) =>
        `[${idx}] ${i.quantity ?? ""} ${i.unit ?? ""} ${i.name}: ${Math.round(i.calories)} kcal, ${Math.round(i.protein_g)} P, ${Math.round(i.carbs_g)} C, ${Math.round(i.fat_g)} F`,
    )
    .join("\n");
  const r = await generateText({
    model,
    instructions:
      "The user is correcting the meal they just logged. Turn their message into edit operations on the listed items (by index). 'It was two servings' → scale_all 2. 'Only half the rice' → scale_item 0.5. 'Remove the milk' → remove_item. 'The bar was 210 calories' → set_item_values with only the stated fields. New foods → add_items with their words.",
    prompt: `Meal: ${meal.title}\n${listing}\n\nCorrection: ${text}`,
    output: Output.object({ schema: editSchema }),
    timeout: 60_000,
  });
  await logAiCall(ctx.userId, "food.edit", started, { usage: r.usage });

  const byIndex = meal.meal_items;
  for (const op of sanitizeOps(r.output.operations, text)) {
    if (op.op === "scale_all") await scaleMeal(ctx.userId, meal, op.factor);
    else if (op.op === "rename")
      ok(
        await db
          .from("meals")
          .update({ title: op.title })
          .eq("id", meal.id)
          .eq("user_id", ctx.userId),
      );
    else if (op.op === "add_items") {
      const parsed = await parseFood(ctx.userId, model, {
        text: op.text,
        image: null,
        today: ctx.today,
      });
      const items = await resolveItems(ctx.userId, model, parsed.items, op.text);
      const start = byIndex.length;
      if (items.length > 0) {
        ok(
          await db.from("meal_items").insert(
            toRpcItems(items).map((i, k) => ({
              ...i,
              meal_id: meal.id,
              user_id: ctx.userId,
              position: start + k,
            })),
          ),
        );
      }
    } else {
      const item = byIndex[op.item];
      if (!item) continue;
      if (op.op === "remove_item") {
        if (byIndex.length > 1)
          ok(await db.from("meal_items").delete().eq("id", item.id).eq("user_id", ctx.userId));
      } else if (op.op === "scale_item") {
        ok(
          await db
            .from("meal_items")
            .update({
              quantity: item.quantity != null ? item.quantity * op.factor : null,
              grams: item.grams != null ? Math.round(item.grams * op.factor) : null,
              calories: round1(item.calories * op.factor),
              protein_g: round1(item.protein_g * op.factor),
              carbs_g: round1(item.carbs_g * op.factor),
              fat_g: round1(item.fat_g * op.factor),
              fiber_g: round1(item.fiber_g * op.factor),
            })
            .eq("id", item.id)
            .eq("user_id", ctx.userId),
        );
      } else if (op.op === "set_item_values") {
        const fields: {
          match_source: "user";
          calories?: number;
          protein_g?: number;
          carbs_g?: number;
          fat_g?: number;
        } = {
          match_source: "user",
        };
        for (const k of ["calories", "protein_g", "carbs_g", "fat_g"] as const) {
          const v = op[k];
          if (v != null) fields[k] = v;
        }
        ok(await db.from("meal_items").update(fields).eq("id", item.id).eq("user_id", ctx.userId));
      }
    }
  }

  const updated = await getMeal(ctx.userId, meal.id);
  if (!updated) return { text: "That meal is gone.", mealId: null };
  return { text: `✏️ Updated\n${mealSummary(updated)}`, mealId: updated.id };
}
