// The signed-in user's profile + integration status. Shared by every page:
// the profile timezone defines what "today" means everywhere in the app, so
// the dashboard and the Telegram bot always agree on daily totals.

import type { Tables, TablesUpdate } from "@liftledger/shared";
import { localDateString } from "@liftledger/shared";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { supabase } from "./supabase";

export type ProfileRow = Tables<"profiles">;
export type IntegrationRow = Tables<"integrations">;
export type TelegramLinkRow = Tables<"telegram_links">;

export const profileQueryKeys = {
  profile: ["profile"] as const,
  integrations: ["integrations"] as const,
  telegramLink: ["integrations", "telegram_link"] as const,
  latestWeight: ["profile", "latest_weight"] as const,
};

export function profileQueryOptions() {
  return queryOptions({
    queryKey: profileQueryKeys.profile,
    queryFn: async (): Promise<ProfileRow> => {
      const { data, error } = await supabase.from("profiles").select("*").single();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useProfile() {
  return useSuspenseQuery(profileQueryOptions());
}

export function useProfileMaybe() {
  return useQuery(profileQueryOptions());
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fields: TablesUpdate<"profiles">) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { error } = await supabase.from("profiles").update(fields).eq("user_id", auth.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileQueryKeys.profile });
    },
  });
}

/** Today's calendar date in the user's profile timezone. */
export function useToday(): string {
  const { data } = useProfile();
  return localDateString(new Date(), data.timezone);
}

function integrationsQueryOptions() {
  return queryOptions({
    queryKey: profileQueryKeys.integrations,
    queryFn: async (): Promise<IntegrationRow[]> => {
      const { data, error } = await supabase.from("integrations").select("*");
      if (error) throw error;
      return data;
    },
  });
}

export function useIntegrations() {
  return useSuspenseQuery(integrationsQueryOptions());
}

export function useIntegrationsMaybe() {
  return useQuery(integrationsQueryOptions());
}

export function useIntegration(provider: IntegrationRow["provider"]): IntegrationRow | null {
  const { data } = useIntegrations();
  return data.find((i) => i.provider === provider && i.status !== "disconnected") ?? null;
}

export function useTelegramLink() {
  return useSuspenseQuery(
    queryOptions({
      queryKey: profileQueryKeys.telegramLink,
      queryFn: async (): Promise<TelegramLinkRow | null> => {
        const { data, error } = await supabase.from("telegram_links").select("*").maybeSingle();
        if (error) throw error;
        return data;
      },
    }),
  );
}

export interface LatestWeight {
  date: string;
  weight_kg: number;
  source: string;
}

export function useLatestWeight() {
  return useSuspenseQuery(
    queryOptions({
      queryKey: profileQueryKeys.latestWeight,
      queryFn: async (): Promise<LatestWeight | null> => {
        const { data, error } = await supabase
          .from("bodyweight")
          .select("date, weight_kg, source")
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!data?.date || data.weight_kg == null || !data.source) return null;
        return { date: data.date, weight_kg: data.weight_kg, source: data.source };
      },
    }),
  );
}
