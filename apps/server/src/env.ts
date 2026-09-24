// Server configuration, validated once at boot so a missing variable fails
// loudly instead of surfacing as a confusing runtime error later.

import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(8790),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:8790"),
  WEB_ORIGIN: z.string().default("http://localhost:5180"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  /** Postgres connection for pg-boss. Only the long-running Node server
   * needs it; the Vercel function talks to Supabase over HTTP. */
  DATABASE_URL: z.string().min(1).optional(),
  /** 32 random bytes, base64. `openssl rand -base64 32` */
  LIFTLEDGER_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  /** Set in production to receive updates by webhook; omit for long polling. */
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_MODE: z.enum(["polling", "webhook", "off"]).default("polling"),
  USDA_FDC_API_KEY: z.string().default("DEMO_KEY"),
  /** Self-hosted default: allow AI base URLs on localhost/LAN (Ollama, LM Studio). */
  ALLOW_PRIVATE_AI_URLS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  HEVY_SYNC_CRON: z.string().default("*/30 * * * *"),
  /** Vercel Cron's bearer token for /cron/daily; the route 401s without it. */
  CRON_SECRET: z.string().min(16).optional(),
  /** Let users pick "Codex CLI": runs `codex exec` on this server with the
   * ChatGPT account signed in to Codex here. Self-hosted installs only —
   * every user who picks it shares that account. */
  CODEX_CLI_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  CODEX_BIN: z.string().default("codex"),
  CODEX_REASONING_EFFORT: z.enum(["minimal", "low", "medium", "high"]).default("low"),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid server environment:\n${problems.join("\n")}`);
  }
  return parsed.data;
}

export const env = load();
