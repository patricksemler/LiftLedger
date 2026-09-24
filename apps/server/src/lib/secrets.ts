import { env } from "../env";
import { open, seal } from "./crypto";
import { db, maybe, ok } from "./db";

type SecretKind = "hevy_api_key" | "ai_api_key";

const key = Buffer.from(env.LIFTLEDGER_ENCRYPTION_KEY, "base64");

export async function putSecret(userId: string, kind: SecretKind, value: string): Promise<void> {
  ok(
    await db
      .from("user_secrets")
      .upsert({ user_id: userId, kind, ...seal(value, key), updated_at: new Date().toISOString() }),
  );
}

export async function getSecret(userId: string, kind: SecretKind): Promise<string | null> {
  const row = maybe(
    await db
      .from("user_secrets")
      .select("ciphertext, iv, auth_tag")
      .eq("user_id", userId)
      .eq("kind", kind)
      .maybeSingle(),
  );
  return row ? open(row, key) : null;
}

export async function deleteSecret(userId: string, kind: SecretKind): Promise<void> {
  ok(await db.from("user_secrets").delete().eq("user_id", userId).eq("kind", kind));
}

export const last4 = (value: string) => value.slice(-4);
