// Transport-free core of the bot: one incoming message → one reply. The
// Telegram layer (index.ts) and the simulate script both call this.

import { getUserModel } from "../ai/provider";
import { db } from "../lib/db";
import { answerQuestion } from "./agent/agent";
import { loadUserContext } from "./context";
import { editLastMeal, logFoodMessage } from "./food/pipeline";
import { classify } from "./router";

export interface BotReply {
  text: string;
  format: "HTML" | "Markdown" | undefined;
  mealId: string | null;
  intent: string;
}

async function remember(
  userId: string,
  role: "user" | "assistant",
  content: string,
  mealId: string | null = null,
) {
  await db
    .from("bot_messages")
    .insert({ user_id: userId, role, content: content.slice(0, 4000), meal_id: mealId });
}

const plain = (text: string, intent: string): BotReply => ({
  text,
  format: undefined,
  mealId: null,
  intent,
});

export async function respond(
  userId: string,
  input: { text: string | null; image: Uint8Array | null; hasPhoto: boolean },
): Promise<BotReply> {
  const ai = await getUserModel(userId);
  if (!ai) {
    return plain(
      "Connect an AI model in LiftLedger → Settings → Connections so I can read meals and answer questions. Until then: /today and /week work.",
      "no_ai",
    );
  }
  if (input.hasPhoto && !ai.config.supports_vision) {
    return plain(
      "Your AI model can't read images. Describe the meal in text instead, e.g. “chicken, rice and broccoli”.",
      "no_vision",
    );
  }

  const ctx = await loadUserContext(userId);
  const text = input.text?.trim() || null;
  // A photo is a meal unless its caption asks something.
  const intent =
    input.hasPhoto && !text?.includes("?")
      ? { intent: "log_food" as const, reply: null }
      : await classify(ctx, ai.model, text ?? "", input.hasPhoto);

  if (intent.intent === "log_food") {
    const r = await logFoodMessage(ctx, ai.model, { text, image: input.image });
    await remember(userId, "user", text ?? "[photo]");
    await remember(userId, "assistant", r.text.replace(/<[^>]+>/g, ""), r.mealId);
    return { text: r.text, format: "HTML", mealId: r.mealId, intent: intent.intent };
  }
  if (intent.intent === "edit_food") {
    const r = await editLastMeal(ctx, ai.model, text ?? "");
    return { text: r.text, format: "HTML", mealId: r.mealId, intent: intent.intent };
  }
  if (intent.intent === "question") {
    if (!ai.config.supports_tools) {
      return plain(
        "Your AI model doesn't support tool calling, which I need to look up your data. Pick a model that does (most hosted ones do, and many local ones like qwen3 or llama3.1).",
        "no_tools",
      );
    }
    const answer = await answerQuestion(ctx, ai.model, text ?? "");
    await remember(userId, "user", text ?? "");
    await remember(userId, "assistant", answer);
    return { text: answer, format: "Markdown", mealId: null, intent: intent.intent };
  }
  return plain(intent.reply ?? "👍", intent.intent);
}
