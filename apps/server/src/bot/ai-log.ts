import { db } from "../lib/db";

interface UsageLike {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
}

/** Best-effort record of each model call for debugging and usage. Never
 * throws — logging must not break a reply. */
export async function logAiCall(
  userId: string,
  purpose: string,
  startedAt: number,
  details: { model?: string; usage?: UsageLike; toolCalls?: unknown; error?: unknown } = {},
): Promise<void> {
  try {
    await db.from("ai_calls").insert({
      user_id: userId,
      purpose,
      model: details.model ?? null,
      input_tokens: details.usage?.inputTokens ?? null,
      output_tokens: details.usage?.outputTokens ?? null,
      latency_ms: Date.now() - startedAt,
      // biome-ignore lint/suspicious/noExplicitAny: jsonb
      tool_calls: (details.toolCalls as any) ?? null,
      error: details.error
        ? String(details.error instanceof Error ? details.error.message : details.error).slice(
            0,
            1000,
          )
        : null,
    });
  } catch {
    // ignore
  }
}
