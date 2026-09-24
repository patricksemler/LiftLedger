// Decides what a message is. One small structured call, so food logging and
// Q&A can each use a focused prompt.

import { type LanguageModel, Output, generateText } from "ai";
import { z } from "zod";
import { logAiCall } from "./ai-log";
import type { UserContext } from "./context";

export const intentSchema = z.object({
  intent: z
    .enum(["log_food", "edit_food", "question", "other"])
    .describe(
      "log_food: they're reporting food/drink they ate or are eating. edit_food: correcting the meal just logged. question: asking about their training, nutrition, weight, goals or progress. other: greetings, thanks, anything else.",
    ),
  reply: z
    .string()
    .nullable()
    .describe("For 'other' only: a one-sentence friendly reply. Otherwise null."),
});

export type Intent = z.infer<typeof intentSchema>;

const QUESTION_START =
  /^(how|what|what's|whats|when|why|which|who|did|do|does|have|has|am|is|are|was|were|should|can|could|will|show|tell|give|list|compare)\b/i;
const EDIT_CUE =
  /^(actually|oops|no[, ]|sorry|correction|make (it|that)|change|remove|delete|drop|only|that was|it was|i meant|scratch that|double|half|halve|add\b)/i;

const SMALL_TALK =
  /^(hi|hey|hello|yo|thanks|thank you|thx|ty|ok|okay|cool|nice|great|perfect|awesome|got it|good (morning|night))\b[\s!.,\u{1F44D}\u{1F64F}]*$/iu;

/** Cheap, model-independent routing for the unambiguous cases — small local
 * models often misroute these. Returns null when the model should decide. */
export function quickIntent(
  text: string,
  lastMealMinutesAgo: number | null,
): Intent["intent"] | null {
  const t = text.trim();
  if (!t) return null;
  if (SMALL_TALK.test(t)) return "other";
  if (lastMealMinutesAgo != null && lastMealMinutesAgo <= 60 && EDIT_CUE.test(t))
    return "edit_food";
  if (t.endsWith("?") || QUESTION_START.test(t)) return "question";
  return null;
}

export async function classify(
  ctx: UserContext,
  model: LanguageModel,
  text: string,
  hasPhoto: boolean,
): Promise<Intent> {
  const minutesAgo = ctx.lastMeal
    ? (Date.now() - new Date(ctx.lastMeal.created_at).getTime()) / 60000
    : null;
  const quick = quickIntent(text, minutesAgo);
  if (quick === "other") {
    return {
      intent: "other",
      reply: /^(hi|hey|hello|yo|good)/i.test(text.trim())
        ? "Hey! Send me a meal or ask about your training."
        : "👍",
    };
  }
  if (quick) return { intent: quick, reply: null };

  const started = Date.now();
  const recent = ctx.lastMeal
    ? `The user logged "${ctx.lastMeal.title}" ${Math.round((Date.now() - new Date(ctx.lastMeal.created_at).getTime()) / 60000)} minutes ago.`
    : "No meal logged in the last few hours.";
  try {
    const r = await generateText({
      model,
      instructions:
        "You route messages for a fitness + nutrition tracking bot. Classify the message. A food description with no question ('chipotle bowl', '3 servings of granola', 'had 2 eggs') is log_food. Mentions of food inside a question ('how much protein did I eat yesterday?') are questions.",
      prompt: `${recent}\n${hasPhoto ? "The message has a photo attached.\n" : ""}Message: ${text}`,
      output: Output.object({ schema: intentSchema }),
      timeout: 30_000,
    });
    await logAiCall(ctx.userId, "router", started, { usage: r.usage });
    return r.output;
  } catch (e) {
    await logAiCall(ctx.userId, "router", started, { error: e });
    throw e;
  }
}
