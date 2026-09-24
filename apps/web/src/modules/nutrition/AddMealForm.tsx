import { Plus, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Card } from "../../components/Card";
import {
  type FoodSearchResult,
  type NewMealItem,
  type SavedFoodRow,
  useFoodSearch,
  useLogMeal,
  useSavedFoods,
} from "./queries";

interface StagedItem {
  key: string;
  name: string;
  brand: string | null;
  servingDesc: string;
  servingGrams: number | null;
  servings: number;
  per: { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
  match_source: NewMealItem["match_source"];
  match_ref: string | null;
}

const inputClass =
  "w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-accent";

const emptyCustom = { name: "", calories: "", protein_g: "", carbs_g: "", fat_g: "" };

function fromSaved(f: SavedFoodRow): StagedItem {
  return {
    key: `saved-${f.id}-${Date.now()}`,
    name: f.name,
    brand: f.brand,
    servingDesc: f.serving_desc,
    servingGrams: f.serving_grams,
    servings: 1,
    per: f,
    match_source: "saved_food",
    match_ref: f.id,
  };
}

function fromSearch(r: FoodSearchResult): StagedItem {
  return {
    key: `${r.id}-${Date.now()}`,
    name: r.name,
    brand: r.brand,
    servingDesc: r.serving_desc,
    servingGrams: r.serving_grams,
    servings: 1,
    per: r,
    match_source: r.source,
    match_ref: r.id,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Build a meal from your saved foods, a USDA / Open Food Facts search, or a
 * quick custom item, then log it in one go. Telegram is the fast path; this
 * is the precise one. */
export function AddMealForm() {
  const logMeal = useLogMeal();
  const savedFoods = useSavedFoods();
  const searchId = useId();
  const [query, setQuery] = useState("");
  // Debounced: the server's food databases are rate-limited.
  const [deferredQuery, setDeferredQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDeferredQuery(query), 350);
    return () => clearTimeout(t);
  }, [query]);
  const search = useFoodSearch(deferredQuery);
  const [staged, setStaged] = useState<StagedItem[]>([]);
  const [title, setTitle] = useState("");
  const [custom, setCustom] = useState(emptyCustom);

  const savedMatches = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (q.length < 1) return [];
    return savedFoods.data.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 5);
  }, [deferredQuery, savedFoods.data]);

  function stage(item: StagedItem) {
    setStaged((s) => [...s, item]);
    setQuery("");
  }

  function addCustom() {
    const calories = Number(custom.calories);
    if (!custom.name.trim() || !Number.isFinite(calories)) return;
    stage({
      key: `custom-${Date.now()}`,
      name: custom.name.trim(),
      brand: null,
      servingDesc: "1 serving",
      servingGrams: null,
      servings: 1,
      per: {
        calories,
        protein_g: Number(custom.protein_g || 0),
        carbs_g: Number(custom.carbs_g || 0),
        fat_g: Number(custom.fat_g || 0),
        fiber_g: 0,
      },
      match_source: "user",
      match_ref: null,
    });
    setCustom(emptyCustom);
  }

  const totals = staged.reduce(
    (acc, s) => ({
      calories: acc.calories + s.per.calories * s.servings,
      protein_g: acc.protein_g + s.per.protein_g * s.servings,
    }),
    { calories: 0, protein_g: 0 },
  );

  async function submit() {
    if (staged.length === 0) return;
    await logMeal.mutateAsync({
      title: title.trim() || staged.map((s) => s.name).join(", "),
      items: staged.map((s) => ({
        name: s.name,
        brand: s.brand,
        quantity: s.servings,
        unit: s.servingDesc,
        grams: s.servingGrams != null ? round1(s.servingGrams * s.servings) : null,
        calories: round1(s.per.calories * s.servings),
        protein_g: round1(s.per.protein_g * s.servings),
        carbs_g: round1(s.per.carbs_g * s.servings),
        fat_g: round1(s.per.fat_g * s.servings),
        fiber_g: round1(s.per.fiber_g * s.servings),
        match_source: s.match_source,
        match_ref: s.match_ref,
      })),
    });
    setStaged([]);
    setTitle("");
  }

  const results = search.data?.results ?? [];
  const showDropdown =
    query.trim().length >= 1 &&
    (savedMatches.length > 0 || results.length > 0 || search.isFetching);

  return (
    <Card className="flex flex-col gap-4">
      <div className="relative flex flex-col gap-1">
        <label htmlFor={searchId} className="text-xs text-ink-dim">
          Add food
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-ink-faint" />
          <input
            id={searchId}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your foods, USDA, Open Food Facts…"
            className={`${inputClass} pl-9`}
          />
        </div>
        {showDropdown && (
          <ul className="absolute top-full z-10 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-border-strong bg-surface-1 shadow-none">
            {savedMatches.map((f) => (
              <ResultRow
                key={f.id}
                name={f.name}
                detail={`Saved · ${f.serving_desc}`}
                calories={f.calories}
                protein={f.protein_g}
                onPick={() => stage(fromSaved(f))}
              />
            ))}
            {results.map((r) => (
              <ResultRow
                key={r.id}
                name={r.brand ? `${r.name} — ${r.brand}` : r.name}
                detail={`${r.source === "usda" ? "USDA" : "Open Food Facts"} · ${r.serving_desc}`}
                calories={r.calories}
                protein={r.protein_g}
                onPick={() => stage(fromSearch(r))}
              />
            ))}
            {search.isFetching && <li className="px-3 py-2 text-xs text-ink-faint">Searching…</li>}
            {search.isError && (
              <li className="px-3 py-2 text-xs text-negative">Food search is unavailable.</li>
            )}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-[1fr_repeat(4,4.5rem)_auto] items-center gap-1.5">
        <input
          value={custom.name}
          onChange={(e) => setCustom({ ...custom, name: e.target.value })}
          placeholder="Or a custom item"
          aria-label="Custom item name"
          className={inputClass}
        />
        {(["calories", "protein_g", "carbs_g", "fat_g"] as const).map((k) => (
          <input
            key={k}
            type="number"
            inputMode="decimal"
            min={0}
            value={custom[k]}
            onChange={(e) => setCustom({ ...custom, [k]: e.target.value })}
            placeholder={k === "calories" ? "kcal" : k.replace("_g", "")}
            aria-label={k}
            className={`${inputClass} px-2`}
          />
        ))}
        <button
          type="button"
          onClick={addCustom}
          aria-label="Add custom item"
          className="rounded-md border border-border bg-surface-2 p-2 text-ink-dim hover:text-ink"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {staged.length > 0 && (
        <>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {staged.map((s) => (
              <li key={s.key} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{s.name}</p>
                  <p className="font-mono text-[11px] text-ink-faint">
                    {Math.round(s.per.calories * s.servings)} kcal ·{" "}
                    {round1(s.per.protein_g * s.servings)} g protein · per {s.servingDesc}
                  </p>
                </div>
                <label className="flex items-center gap-1 text-xs text-ink-faint">
                  ×
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0.25}
                    step={0.25}
                    value={s.servings}
                    onChange={(e) =>
                      setStaged((all) =>
                        all.map((x) =>
                          x.key === s.key
                            ? { ...x, servings: Math.max(0, Number(e.target.value)) }
                            : x,
                        ),
                      )
                    }
                    aria-label={`Servings of ${s.name}`}
                    className="w-16 rounded-md border border-border bg-surface-2 px-2 py-1 text-sm text-ink tabular-nums"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setStaged((all) => all.filter((x) => x.key !== s.key))}
                  aria-label={`Remove ${s.name}`}
                  className="rounded-md p-1 text-ink-faint hover:text-negative"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Meal name (optional)"
              aria-label="Meal name"
              className={`${inputClass} max-w-xs`}
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={logMeal.isPending}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {logMeal.isPending ? "Logging…" : `Log meal · ${Math.round(totals.calories)} kcal`}
            </button>
            {logMeal.isError && <span className="text-xs text-negative">Couldn't log that.</span>}
          </div>
        </>
      )}
    </Card>
  );
}

function ResultRow(props: {
  name: string;
  detail: string;
  calories: number;
  protein: number;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={props.onPick}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">{props.name}</span>
          <span className="block truncate text-[11px] text-ink-faint">{props.detail}</span>
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-ink-dim">
          {Math.round(props.calories)} kcal · {Math.round(props.protein)}P
        </span>
      </button>
    </li>
  );
}
