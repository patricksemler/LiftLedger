// Health Auto Export (iOS) REST payload → daily rows. Expected setup: JSON,
// export version 2, Summarize Data on, grouped by day — so each metric has at
// most one point per day, and a re-export of "today" carries the full day's
// total and simply replaces the earlier value.
//
// Payload: { data: { metrics: [{ name, units, data: [{ date, qty }] }], ... } }
// Dates look like "2026-09-23 00:00:00 -0500": with day grouping the first 10
// characters are the phone's local calendar day, which is the day we want.

export type DailyMetric = "steps" | "active_kcal" | "basal_kcal";

export interface ParsedHealth {
  daily: { date: string; metric: DailyMetric; value: number }[];
  weights: { date: string; weight_kg: number | null; fat_percent: number | null }[];
  ignored: string[];
}

interface HaeMetric {
  name?: string;
  units?: string;
  data?: { date?: string; qty?: number | string }[];
}

const KJ_PER_KCAL = 4.184;
const KG_PER_LB = 0.45359237;

const DAILY: Record<string, DailyMetric> = {
  step_count: "steps",
  active_energy: "active_kcal",
  basal_energy_burned: "basal_kcal",
  resting_energy: "basal_kcal",
};

function dayOf(date: string | undefined): string | null {
  const d = date?.slice(0, 10);
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function qtyOf(q: unknown): number | null {
  const n = typeof q === "string" ? Number(q) : typeof q === "number" ? q : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

export function parseHealthPayload(body: unknown): ParsedHealth {
  const metrics = ((body as { data?: { metrics?: HaeMetric[] } })?.data?.metrics ??
    []) as HaeMetric[];
  const daily = new Map<string, { date: string; metric: DailyMetric; value: number }>();
  const weights = new Map<
    string,
    { date: string; weight_kg: number | null; fat_percent: number | null }
  >();
  const ignored = new Set<string>();

  for (const m of metrics) {
    const name = m.name ?? "";
    const units = (m.units ?? "").toLowerCase();
    const target = DAILY[name];

    for (const point of m.data ?? []) {
      const date = dayOf(point.date);
      const qty = qtyOf(point.qty);
      if (!date || qty == null) continue;

      if (target) {
        const value = target !== "steps" && units === "kj" ? qty / KJ_PER_KCAL : qty;
        const key = `${date}|${target}`;
        // Summarized exports give one point per day; if an unsummarized one
        // slips through, the points are parts of the day, so add them up.
        const prev = daily.get(key);
        daily.set(key, { date, metric: target, value: (prev?.value ?? 0) + value });
      } else if (name === "weight_body_mass") {
        const kg = units === "lb" || units === "lbs" ? qty * KG_PER_LB : qty;
        const prev = weights.get(date);
        weights.set(date, {
          date,
          weight_kg: Math.round(kg * 100) / 100,
          fat_percent: prev?.fat_percent ?? null,
        });
      } else if (name === "body_fat_percentage") {
        const pct = qty <= 1 ? qty * 100 : qty;
        const prev = weights.get(date);
        weights.set(date, {
          date,
          weight_kg: prev?.weight_kg ?? null,
          fat_percent: Math.round(pct * 10) / 10,
        });
      } else {
        ignored.add(name);
      }
    }
  }

  return {
    daily: [...daily.values()].map((d) => ({
      ...d,
      value: d.metric === "steps" ? Math.round(d.value) : Math.round(d.value * 10) / 10,
    })),
    weights: [...weights.values()],
    ignored: [...ignored],
  };
}
