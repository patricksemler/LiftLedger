import { Check, ChevronDown, Pencil, Repeat2, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Card } from "../../components/Card";
import {
  type MealItemRow,
  type MealRow,
  useDeleteMeal,
  useDeleteMealItem,
  useRepeatMeal,
  useUpdateMealItem,
} from "./queries";

const SOURCE_LABEL: Record<MealItemRow["match_source"], string> = {
  user: "your numbers",
  saved_food: "saved food",
  recall: "past meal",
  usda: "USDA",
  off: "Open Food Facts",
  llm: "AI estimate",
};

const r = (n: number) => Math.round(n);

export function MealList({ meals, emptyText }: { meals: MealRow[]; emptyText?: string }) {
  if (meals.length === 0) {
    return (
      <Card as="p" padding="none" className="px-4 py-6 text-center text-sm text-ink-faint">
        {emptyText ?? "Nothing logged today."}
      </Card>
    );
  }
  return (
    <Card as="ul" padding="none" className="flex flex-col divide-y divide-border">
      {meals.map((meal) => (
        <MealRowItem key={meal.id} meal={meal} />
      ))}
    </Card>
  );
}

function MealRowItem({ meal }: { meal: MealRow }) {
  const deleteMeal = useDeleteMeal();
  const repeatMeal = useRepeatMeal();
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const time = new Date(meal.eaten_at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <li className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={`size-4 shrink-0 text-ink-faint transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm text-ink">{meal.title}</span>
            <span className="flex flex-wrap items-center gap-x-2 font-mono text-xs tabular-nums text-ink-faint">
              <span>{time}</span>
              <span>{r(meal.calories)} kcal</span>
              <span>
                {r(meal.protein_g)}P / {r(meal.carbs_g)}C / {r(meal.fat_g)}F
              </span>
              {meal.source.startsWith("tg") && <span>· telegram</span>}
              {meal.confidence === "low" && (
                <span className="text-negative/80">· rough estimate</span>
              )}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {confirmingDelete ? (
            <>
              <span className="text-xs text-ink-dim">Delete?</span>
              <button
                type="button"
                onClick={() => deleteMeal.mutate(meal.id)}
                disabled={deleteMeal.isPending}
                className="rounded-md bg-negative-dim px-2 py-1 text-xs text-negative hover:opacity-80"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded-md px-2 py-1 text-xs text-ink-faint hover:text-ink"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => repeatMeal.mutate(meal)}
                disabled={repeatMeal.isPending}
                title="Log again now"
                aria-label={`Log ${meal.title} again`}
                className="rounded-md p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink"
              >
                <Repeat2 className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                aria-label={`Delete ${meal.title}`}
                className="rounded-md p-1.5 text-ink-faint hover:bg-surface-2 hover:text-negative"
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {open && (
        <ul className="flex flex-col gap-1 border-t border-border/60 bg-surface-0/40 px-4 py-2 pl-10">
          {meal.meal_items.map((item) => (
            <ItemRow key={item.id} item={item} onlyItem={meal.meal_items.length === 1} />
          ))}
          {meal.raw_text && (
            <li className="pt-1 text-[11px] text-ink-faint">You said: “{meal.raw_text}”</li>
          )}
        </ul>
      )}
    </li>
  );
}

function ItemRow({ item, onlyItem }: { item: MealItemRow; onlyItem: boolean }) {
  const update = useUpdateMealItem();
  const remove = useDeleteMealItem();
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState({
    name: item.name,
    calories: String(r(item.calories)),
    protein_g: String(r(item.protein_g)),
    carbs_g: String(r(item.carbs_g)),
    fat_g: String(r(item.fat_g)),
  });

  function save() {
    const nums = ["calories", "protein_g", "carbs_g", "fat_g"] as const;
    if (!fields.name.trim() || !nums.every((k) => Number.isFinite(Number(fields[k])))) return;
    update.mutate(
      {
        id: item.id,
        fields: {
          name: fields.name.trim(),
          calories: Number(fields.calories),
          protein_g: Number(fields.protein_g),
          carbs_g: Number(fields.carbs_g),
          fat_g: Number(fields.fat_g),
        },
      },
      { onSuccess: () => setEditing(false) },
    );
  }

  if (editing) {
    return (
      <li className="flex items-center gap-1.5 py-1">
        <input
          value={fields.name}
          onChange={(e) => setFields({ ...fields, name: e.target.value })}
          aria-label="Item name"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-ink"
        />
        {(["calories", "protein_g", "carbs_g", "fat_g"] as const).map((k) => (
          <input
            key={k}
            type="number"
            value={fields[k]}
            onChange={(e) => setFields({ ...fields, [k]: e.target.value })}
            aria-label={k}
            className="w-14 rounded-md border border-border bg-surface-2 px-1.5 py-1 text-xs text-ink tabular-nums"
          />
        ))}
        <button type="button" onClick={save} aria-label="Save" className="p-1 text-positive">
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label="Cancel"
          className="p-1 text-ink-faint"
        >
          <X className="size-3.5" />
        </button>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-2 py-1 text-xs">
      <span className="min-w-0 flex-1 truncate text-ink-dim">
        {item.quantity != null && item.unit ? `${item.quantity} × ${item.unit} ` : ""}
        <span className="text-ink">{item.name}</span>
        {item.brand ? ` (${item.brand})` : ""}
      </span>
      <span className="shrink-0 font-mono tabular-nums text-ink-faint">
        {r(item.calories)} kcal · {r(item.protein_g)}P
      </span>
      <span className="hidden shrink-0 text-[10px] text-ink-faint sm:inline">
        {SOURCE_LABEL[item.match_source]}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${item.name}`}
        className="p-1 text-ink-faint hover:text-ink"
      >
        <Pencil className="size-3" />
      </button>
      {!onlyItem && (
        <button
          type="button"
          onClick={() => remove.mutate(item.id)}
          aria-label={`Remove ${item.name}`}
          className="p-1 text-ink-faint hover:text-negative"
        >
          <Trash2 className="size-3" />
        </button>
      )}
    </li>
  );
}
