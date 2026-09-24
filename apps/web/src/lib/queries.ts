// TanStack Query client + the Realtime -> invalidate wiring helper. Modules
// use `subscribeAndInvalidate` from a `useEffect` in their page component so
// a change made over Telegram appears on an open dashboard within seconds
// (PLAN.md "Web app: structure & design").

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "./supabase";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

export interface SubscribeAndInvalidateOptions {
  /** Postgres table to watch, e.g. 'routine_completions'. */
  table: string;
  /** Query key(s) to invalidate whenever a row changes. */
  queryKey: QueryKey;
  /** Optional Postgres changes filter, e.g. `user_id=eq.<uuid>`. */
  filter?: string;
  onChange?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
}

/**
 * Subscribes to Supabase Realtime changes on `table` and invalidates
 * `queryKey` on every INSERT/UPDATE/DELETE. Returns an unsubscribe function
 * — call it from the `useEffect` cleanup. Stubbed contract for Phase 0;
 * modules wire it up per-table starting with routines (Phase 3).
 *
 * Usage:
 *   useEffect(
 *     () => subscribeAndInvalidate({ table: "routine_completions", queryKey: ["routines"] }),
 *     [],
 *   );
 */
export function subscribeAndInvalidate(options: SubscribeAndInvalidateOptions): () => void {
  const channelName = `realtime:${options.table}:${options.filter ?? "all"}`;
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: options.table, filter: options.filter },
      (payload) => {
        options.onChange?.(payload);
        void queryClient.invalidateQueries({ queryKey: options.queryKey });
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
