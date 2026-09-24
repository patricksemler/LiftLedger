import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Card } from "../../components/Card";
import { type SavedFoodRow, useDeleteSavedFood, useSaveFood } from "./queries";

const empty = {
  name: "",
  brand: "",
  serving_desc: "1 serving",
  serving_grams: "",
  calories: "",
  protein_g: "",
  carbs_g: "",
  fat_g: "",
};

const inputClass =
  "w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-accent";

/** Your own foods, e.g. "HEB Premium Granola — 2/3 cup (55 g) — 240 kcal".
 * The bot checks these before any database lookup, so "3 servings of heb
 * granola" resolves exactly. */
export function SavedFoods({ foods }: { foods: SavedFoodRow[] }) {
  const save = useSaveFood();
  const remove = useDeleteSavedFood();
  const [f, setF] = useState(empty);

  async function submit() {
    const calories = Number(f.calories);
    if (!f.name.trim() || !Number.isFinite(calories)) return;
    await save.mutateAsync({
      name: f.name.trim(),
      brand: f.brand.trim() || null,
      serving_desc: f.serving_desc.trim() || "1 serving",
      serving_grams: f.serving_grams ? Number(f.serving_grams) : null,
      calories,
      protein_g: Number(f.protein_g || 0),
      carbs_g: Number(f.carbs_g || 0),
      fat_g: Number(f.fat_g || 0),
    });
    setF(empty);
  }

  return (
    <div className="flex flex-col gap-3">
      {foods.length > 0 && (
        <Card as="ul" padding="none" className="flex flex-col divide-y divide-border">
          {foods.map((food) => (
            <li key={food.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">
                  {food.name}
                  {food.brand && <span className="text-ink-faint"> · {food.brand}</span>}
                </p>
                <p className="font-mono text-[11px] tabular-nums text-ink-faint">
                  {food.serving_desc}
                  {food.serving_grams ? ` (${food.serving_grams} g)` : ""} · {food.calories} kcal ·{" "}
                  {food.protein_g}P / {food.carbs_g}C / {food.fat_g}F
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove.mutate(food.id)}
                aria-label={`Delete ${food.name}`}
                className="rounded-md p-1.5 text-ink-faint hover:text-negative"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </Card>
      )}
      <Card className="flex flex-col gap-2">
        <p className="text-xs text-ink-dim">Save a food (per serving)</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            className={inputClass}
            placeholder="Name"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Brand (optional)"
            value={f.brand}
            onChange={(e) => setF({ ...f, brand: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Serving, e.g. 2/3 cup"
            value={f.serving_desc}
            onChange={(e) => setF({ ...f, serving_desc: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Grams (optional)"
            type="number"
            value={f.serving_grams}
            onChange={(e) => setF({ ...f, serving_grams: e.target.value })}
          />
          {(["calories", "protein_g", "carbs_g", "fat_g"] as const).map((k) => (
            <input
              key={k}
              className={inputClass}
              type="number"
              inputMode="decimal"
              placeholder={k === "calories" ? "kcal" : `${k.replace("_g", "")} g`}
              value={f[k]}
              onChange={(e) => setF({ ...f, [k]: e.target.value })}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={save.isPending || !f.name.trim() || !f.calories}
          className="self-start rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs text-ink hover:bg-surface-3 disabled:opacity-40"
        >
          {save.isPending ? "Saving…" : "Save food"}
        </button>
        {save.isError && <p className="text-xs text-negative">{(save.error as Error).message}</p>}
      </Card>
    </div>
  );
}
