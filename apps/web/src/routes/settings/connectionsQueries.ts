import type { AiProviderKind } from "@liftledger/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiPost } from "../../lib/api";
import { profileQueryKeys } from "../../lib/profile";

function useInvalidateIntegrations() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: profileQueryKeys.integrations });
}

export function useConnectHevy() {
  const invalidate = useInvalidateIntegrations();
  return useMutation({
    mutationFn: (apiKey: string) =>
      apiPost<{ workoutCount: number }>("/api/connections/hevy", { apiKey }),
    onSuccess: invalidate,
  });
}

export interface AiConnectionInput {
  kind: AiProviderKind;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface AiCapabilities {
  supports_tools: boolean;
  supports_vision: boolean;
}

export function useConnectAi() {
  const invalidate = useInvalidateIntegrations();
  return useMutation({
    mutationFn: (input: AiConnectionInput) =>
      apiPost<{ capabilities: AiCapabilities }>("/api/connections/ai", input),
    onSuccess: invalidate,
  });
}

export function useDisconnect(provider: "ai" | "apple_health") {
  const invalidate = useInvalidateIntegrations();
  return useMutation({
    mutationFn: () =>
      apiDelete<{ ok: true }>(`/api/connections/${provider === "ai" ? "ai" : "apple-health"}`),
    onSuccess: invalidate,
  });
}

export function useTelegramLinkCode() {
  return useMutation({
    mutationFn: () => apiPost<{ url: string; expiresAt: string }>("/api/connections/telegram/link"),
  });
}

export function useAppleHealthToken() {
  const invalidate = useInvalidateIntegrations();
  return useMutation({
    mutationFn: () =>
      apiPost<{ token: string; url: string }>("/api/connections/apple-health/token"),
    onSuccess: invalidate,
  });
}
