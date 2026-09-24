// Per-user language model from the user's own provider config: Anthropic,
// OpenAI, or any OpenAI-compatible base URL (Ollama, LM Studio, vLLM...).

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { AiProviderKind } from "@liftledger/shared";
import { type LanguageModel, generateText, tool } from "ai";
import { z } from "zod";
import { env } from "../env";
import { getIntegration } from "../lib/integrations";
import { getSecret } from "../lib/secrets";

export interface AiConfig {
  kind: AiProviderKind;
  model: string;
  base_url?: string | null;
  supports_tools?: boolean;
  supports_vision?: boolean;
}

export interface UserModel {
  model: LanguageModel;
  config: AiConfig;
}

export function buildModel(config: AiConfig, apiKey: string | null): LanguageModel {
  switch (config.kind) {
    case "anthropic":
      return createAnthropic({ apiKey: apiKey ?? "" })(config.model);
    case "openai":
      return createOpenAI({ apiKey: apiKey ?? "" })(config.model);
    case "openai_compatible":
      return createOpenAICompatible({
        name: "custom",
        baseURL: config.base_url ?? "",
        apiKey: apiKey ?? undefined,
        supportsStructuredOutputs: true,
      })(config.model);
  }
}

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|\[?::1\]?|.*\.local$|.*\.internal$)/i;

/** Rejects URLs that would let a hosted server be pointed at its own
 * network, unless this is a self-hosted install. */
export function checkBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That base URL isn't a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Base URL must start with http:// or https://");
  }
  if (!env.ALLOW_PRIVATE_AI_URLS && PRIVATE_HOST.test(url.hostname)) {
    throw new Error("Private network addresses aren't allowed on this server.");
  }
  return url.toString().replace(/\/$/, "");
}

// 1x1 red PNG, for the vision probe.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  "base64",
);

/** Checks the model answers at all (throws if not), then probes tool calling
 * and image input. Local models often lack one or both; the bot adapts. */
export async function probeModel(
  model: LanguageModel,
): Promise<{ supports_tools: boolean; supports_vision: boolean }> {
  const timeout = 45_000;
  await generateText({ model, prompt: "Reply with the single word: ok", timeout });

  let supports_tools = false;
  try {
    const r = await generateText({
      model,
      timeout,
      tools: {
        add: tool({
          description: "Add two numbers",
          inputSchema: z.object({ a: z.number(), b: z.number() }),
          execute: async ({ a, b }) => a + b,
        }),
      },
      toolChoice: "required",
      prompt: "Use the add tool to add 2 and 3.",
    });
    supports_tools = r.steps.some((s) => s.toolCalls.length > 0);
  } catch {
    supports_tools = false;
  }

  let supports_vision = false;
  try {
    await generateText({
      model,
      timeout,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What color is this image? One word." },
            { type: "image", image: PIXEL, mediaType: "image/png" },
          ],
        },
      ],
    });
    supports_vision = true;
  } catch {
    supports_vision = false;
  }

  return { supports_tools, supports_vision };
}

/** The user's configured model, or null when they haven't connected one. */
export async function getUserModel(userId: string): Promise<UserModel | null> {
  const integration = await getIntegration(userId, "ai");
  if (!integration || integration.status !== "connected") return null;
  const config = integration.config as unknown as AiConfig;
  const apiKey = await getSecret(userId, "ai_api_key");
  return { model: buildModel(config, apiKey), config };
}
