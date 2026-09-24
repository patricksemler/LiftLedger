// AES-256-GCM for user API keys at rest. The key lives only in the server
// environment; the database holds ciphertext + iv + auth tag, so a leaked DB
// dump alone reveals nothing.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const KEY_VERSION = 1;

export interface Sealed {
  ciphertext: string;
  iv: string;
  auth_tag: string;
  key_version: number;
}

export function seal(plaintext: string, key: Buffer): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    auth_tag: cipher.getAuthTag().toString("base64"),
    key_version: KEY_VERSION,
  };
}

export function open(sealed: Omit<Sealed, "key_version">, key: Buffer): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.auth_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** URL-safe random token, e.g. for ingest tokens and link codes. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
