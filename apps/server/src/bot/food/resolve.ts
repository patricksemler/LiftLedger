// Resolves parsed items to numbers, strongest source first:
//   user-stated values > saved foods > the user's past items > USDA / Open
//   Food Facts > the model's own estimate.
// User-stated fields always override whatever the lookup found, field by
// field, so "1 cup black beans 50 cals" keeps 50 kcal but still gets carbs
// and fat from the database.

import { type LanguageModel, Output, generateText } from "ai";
import { z } from "zod";
import { searchFoods } from "../../foods/search";
import type { FoodCandidate, Macros } from "../../foods/types";
import { db } from "../../lib/db";
import { logAiCall } from "../ai-log";
import { type Amount, amountOf, isServingUnit, macrosFor } from "./amounts";
import type { ParsedItem } from "./schema";

export type MatchSource = "user" | "saved_food" | "recall" | "usda" | "off" | "llm";

export interface ResolvedItem extends Macros {
  name: string;
  brand: string | null;
  quantity: number | null;
  unit: string | null;
  grams: number | null;
  match_source: MatchSource;
  match_ref: string | null;
  /** Where the numbers came from, for the reply ("USDA", "your saved food"). */
  label: string;
  userStated: boolean;
}

const SAVED_MIN_SCORE = 0.45;

const n = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v);

function applyUserValues(
  base: Macros,
  user: ParsedItem["user_values"],
): { macros: Macros; any: boolean } {
  const out = { ...base };
  let any = false;
  for (const k of ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"] as const) {
    const v = n(user[k]);
    if (v != null) {
      out[k] = v;
      any = true;
    }
  }
  return { macros: out, any };
}

function estimateOf(item: ParsedItem): Macros {
  return {
    calories: n(item.estimate.calories) ?? 0,
    protein_g: n(item.estimate.protein_g) ?? 0,
    carbs_g: n(item.estimate.carbs_g) ?? 0,
    fat_g: n(item.estimate.fat_g) ?? 0,
    fiber_g: n(item.estimate.fiber_g) ?? 0,
  };
}

function userCoversEverything(item: ParsedItem): boolean {
  const u = item.user_values;
  return (
    n(u.calories) != null && n(u.protein_g) != null && n(u.carbs_g) != null && n(u.fat_g) != null
  );
}

async function trySavedFood(userId: string, item: ParsedItem) {
  const query = [item.brand, item.name].filter(Boolean).join(" ");
  const { data } = await db.rpc("match_saved_foods", {
    p_user_id: userId,
    p_query: query,
    p_limit: 1,
  });
  const best = data?.[0];
  return best && best.score >= SAVED_MIN_SCORE ? best : null;
}

async function tryRecall(userId: string, item: ParsedItem) {
  const { data } = await db.rpc("match_recent_items", {
    p_user_id: userId,
    p_query: item.name,
    p_limit: 1,
  });
  const best = data?.[0];
  // Only reuse past numbers that came from something better than a guess.
  return best && best.score >= 0.6 && best.match_source !== "llm" ? best : null;
}

const pickSchema = z.object({
  picks: z.array(
    z.object({
      item: z.number().int(),
      candidate: z
        .number()
        .int()
        .nullable()
        .describe("Index of the matching candidate, or null if none fits"),
    }),
  ),
});

/** One model call to choose the right database entry for every item that
 * needed a lookup ("Beans, black, canned" over "Beans, black, raw"). */
async function pickCandidates(
  userId: string,
  model: LanguageModel,
  pending: { index: number; item: ParsedItem; candidates: FoodCandidate[] }[],
): Promise<Map<number, FoodCandidate | null>> {
  const result = new Map<number, FoodCandidate | null>();
  if (pending.length === 0) return result;
  const started = Date.now();
  const listing = pending
    .map((p) => {
      const header = `Item ${p.index}: ${p.item.quantity ?? ""} ${p.item.unit ?? ""} ${p.item.name}${p.item.brand ? ` (brand: ${p.item.brand})` : ""}`;
      const options = p.candidates.map(
        (c, i) =>
          `  [${i}] ${c.name}${c.brand ? ` — ${c.brand}` : ""} · ${Math.round(c.calories)} kcal per ${c.serving_desc}`,
      );
      return [header, ...options].join("\n");
    })
    .join("\n\n");
  try {
    const r = await generateText({
      model,
      instructions:
        "Match each eaten item to the database candidate describing the same food in the same state (cooked vs raw, canned vs dry, brand when given). Prefer the stated brand. Return null when nothing is a real match — a wrong match is worse than none.",
      prompt: listing,
      output: Output.object({ schema: pickSchema }),
      timeout: 60_000,
    });
    await logAiCall(userId, "food.pick", started, { usage: r.usage });
    for (const pick of r.output.picks) {
      const p = pending.find((x) => x.index === pick.item);
      if (!p) continue;
      result.set(pick.item, pick.candidate == null ? null : (p.candidates[pick.candidate] ?? null));
    }
  } catch (e) {
    await logAiCall(userId, "food.pick", started, { error: e });
  }
  return result;
}

export async function resolveItems(
  userId: string,
  model: LanguageModel,
  items: ParsedItem[],
): Promise<ResolvedItem[]> {
  const resolved: (ResolvedItem | null)[] = items.map(() => null);
  const needsLookup: { index: number; item: ParsedItem; candidates: FoodCandidate[] }[] = [];

  await Promise.all(
    items.map(async (item, index) => {
      const amount = amountOf(item);
      const common = {
        name: item.name,
        brand: item.brand,
        quantity: item.quantity,
        unit: item.unit,
      };

      if (userCoversEverything(item)) {
        const { macros } = applyUserValues(estimateOf(item), item.user_values);
        resolved[index] = {
          ...common,
          ...macros,
          grams: amount.grams ?? n(item.grams_estimate),
          match_source: "user",
          match_ref: null,
          label: "your numbers",
          userStated: true,
        };
        return;
      }

      const saved = await trySavedFood(userId, item);
      if (saved) {
        const { macros, grams } = macrosFor(saved, amount);
        const user = applyUserValues(macros, item.user_values);
        resolved[index] = {
          ...common,
          name: saved.name,
          brand: saved.brand,
          ...user.macros,
          grams,
          match_source: "saved_food",
          match_ref: saved.id,
          label: "your saved food",
          userStated: user.any,
        };
        return;
      }

      const past = await tryRecall(userId, item);
      if (past) {
        // Scale the past entry by quantity when units line up, else by grams.
        const factor =
          past.quantity && item.quantity && (past.unit ?? "") === (item.unit ?? "")
            ? item.quantity / past.quantity
            : past.grams && amount.grams
              ? amount.grams / past.grams
              : 1;
        const base: Macros = {
          calories: past.calories * factor,
          protein_g: past.protein_g * factor,
          carbs_g: past.carbs_g * factor,
          fat_g: past.fat_g * factor,
          fiber_g: past.fiber_g * factor,
        };
        const user = applyUserValues(base, item.user_values);
        resolved[index] = {
          ...common,
          ...user.macros,
          grams: past.grams ? past.grams * factor : amount.grams,
          match_source: "recall",
          match_ref: null,
          label: "like last time",
          userStated: user.any,
        };
        return;
      }

      const candidates = await searchFoods(item.search_query || item.name, {
        branded: !!item.brand,
        limit: 6,
      });
      if (candidates.length > 0) needsLookup.push({ index, item, candidates });
    }),
  );

  const picks = await pickCandidates(userId, model, needsLookup);

  return items.map((item, index) => {
    const done = resolved[index];
    if (done) return done;
    const amount = amountOf(item);
    const common = { name: item.name, brand: item.brand, quantity: item.quantity, unit: item.unit };
    const picked = picks.get(index);
    if (picked) {
      // "2 eggs" against a generic per-100 g entry means two eggs, not two
      // 100 g servings: use the gram estimate unless they said "servings".
      let amt: Amount = amount;
      const genericEntry = picked.serving_desc === "100 g";
      if (
        (amount.servings != null && genericEntry && !isServingUnit(item.unit)) ||
        (amount.grams == null && amount.servings == null)
      ) {
        const est = n(item.grams_estimate);
        if (est != null) amt = { grams: est, servings: null };
      }
      const { macros, grams } = macrosFor(picked, amt);
      const user = applyUserValues(macros, item.user_values);
      return {
        ...common,
        brand: item.brand ?? picked.brand,
        ...user.macros,
        grams: grams ?? n(item.grams_estimate),
        match_source: picked.source,
        match_ref: picked.id,
        label: picked.source === "usda" ? "USDA" : "Open Food Facts",
        userStated: user.any,
      };
    }
    const user = applyUserValues(estimateOf(item), item.user_values);
    return {
      ...common,
      ...user.macros,
      grams: amount.grams ?? n(item.grams_estimate),
      match_source: user.any ? "user" : "llm",
      match_ref: null,
      label: user.any ? "your numbers + estimate" : "estimate",
      userStated: user.any,
    };
  });
}

export function mealConfidence(items: ResolvedItem[]): "high" | "medium" | "low" {
  if (items.some((i) => i.match_source === "llm")) return "low";
  if (items.every((i) => i.match_source === "user" || i.match_source === "saved_food"))
    return "high";
  return "medium";
}
