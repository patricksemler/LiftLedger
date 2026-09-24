import { Card } from "../../components/Card";
import type { FoodAggregate } from "./derive";

/** Foods ranked by total calories over the window — the dashboard side of
 * "what am I overeating on". */
export function TopFoods({ foods }: { foods: FoodAggregate[] }) {
  if (foods.length === 0) {
    return (
      <Card as="p" padding="none" className="px-4 py-6 text-center text-sm text-ink-faint">
        Log a few meals and your biggest calorie sources show up here.
      </Card>
    );
  }
  return (
    <Card as="ul" padding="none" className="flex flex-col divide-y divide-border">
      {foods.map((f) => (
        <li key={f.name} className="flex items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-ink">{f.name}</p>
            <div className="mt-1 h-1 rounded-full bg-surface-2">
              <div
                className="h-1 rounded-full bg-accent"
                style={{ width: `${Math.max(2, f.shareOfCalories * 100)}%` }}
              />
            </div>
          </div>
          <div className="shrink-0 text-right font-mono text-xs tabular-nums text-ink-dim">
            <p>{f.calories.toLocaleString()} kcal</p>
            <p className="text-ink-faint">
              ×{f.count} · {Math.round(f.shareOfCalories * 100)}%
            </p>
          </div>
        </li>
      ))}
    </Card>
  );
}
