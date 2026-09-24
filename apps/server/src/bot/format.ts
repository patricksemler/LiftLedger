// Telegram HTML replies. Only <b>, <i>, <code> are used; everything
// user-provided is escaped.

import type { UserContext } from "./context";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const kcal = (n: number) => Math.round(n).toLocaleString("en-US");
const g = (n: number) => `${Math.round(n)}`;

interface ItemLike {
  name: string;
  quantity: number | null;
  unit: string | null;
  calories: number;
  protein_g: number;
  label?: string;
}

export function itemLine(i: ItemLike): string {
  const amount =
    i.quantity != null ? `${+i.quantity.toFixed(2)}${i.unit ? ` ${i.unit}` : "×"} ` : "";
  const source = i.label ? ` <i>(${esc(i.label)})</i>` : "";
  return `• ${esc(amount + i.name)} — ${kcal(i.calories)} kcal · ${g(i.protein_g)} g P${source}`;
}

export function totalsLine(t: {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}): string {
  return `<b>${kcal(t.calories)} kcal</b> · ${g(t.protein_g)}P / ${g(t.carbs_g)}C / ${g(t.fat_g)}F`;
}

export function todayLine(ctx: Pick<UserContext, "goal" | "todayTotals">): string {
  const t = ctx.todayTotals;
  if (!ctx.goal)
    return `Today: ${kcal(t.calories)} kcal · ${g(t.protein_g)} g protein (no goal set)`;
  const left = ctx.goal.calories - t.calories;
  const leftText = left >= 0 ? `${kcal(left)} left` : `${kcal(-left)} over`;
  return `Today: ${kcal(t.calories)} / ${kcal(ctx.goal.calories)} kcal (${leftText}) · ${g(t.protein_g)} / ${ctx.goal.protein_g} g protein`;
}
