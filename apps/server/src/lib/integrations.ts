import type { Json } from "@liftledger/shared";
import { db, maybe, ok } from "./db";

export type Provider = "hevy" | "ai" | "telegram" | "apple_health";

export async function upsertIntegration(
  userId: string,
  provider: Provider,
  fields: {
    status?: "connected" | "error" | "disconnected";
    config?: Json;
    secret_last4?: string | null;
    last_sync_at?: string | null;
    last_error?: string | null;
  },
): Promise<void> {
  ok(
    await db
      .from("integrations")
      .upsert({ user_id: userId, provider, ...fields }, { onConflict: "user_id,provider" }),
  );
}

export async function getIntegration(userId: string, provider: Provider) {
  return maybe(
    await db
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .neq("status", "disconnected")
      .maybeSingle(),
  );
}
