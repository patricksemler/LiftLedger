// Apple Health daily metrics (via Health Auto Export). Optional: every
// consumer renders nothing, or a "Connect Apple Health" hint, when empty.

import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";

export type HealthMetric = "steps" | "active_kcal" | "basal_kcal";

export interface HealthDay {
  date: string;
  steps: number | null;
  active_kcal: number | null;
  basal_kcal: number | null;
}

export const healthQueryKeys = {
  prefix: ["health"] as const,
  range: (from: string, to: string) => ["health", from, to] as const,
};

export function healthRangeQueryOptions(from: string, to: string) {
  return queryOptions({
    queryKey: healthQueryKeys.range(from, to),
    queryFn: async (): Promise<HealthDay[]> => {
      const { data, error } = await supabase
        .from("health_daily")
        .select("date, metric, value")
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true });
      if (error) throw error;
      const byDate = new Map<string, HealthDay>();
      for (const row of data) {
        const day = byDate.get(row.date) ?? {
          date: row.date,
          steps: null,
          active_kcal: null,
          basal_kcal: null,
        };
        day[row.metric as HealthMetric] = row.value;
        byDate.set(row.date, day);
      }
      return [...byDate.values()];
    },
  });
}

export function useHealthRange(from: string, to: string) {
  return useQuery(healthRangeQueryOptions(from, to));
}
