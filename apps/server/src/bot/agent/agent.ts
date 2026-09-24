// Grounded Q&A over the user's own training and nutrition data. A short tool
// loop: the model picks tools, the tools do the math, the model phrases it.

import { type LanguageModel, type ModelMessage, generateText, stepCountIs } from "ai";
import { db, must } from "../../lib/db";
import { logAiCall } from "../ai-log";
import type { UserContext } from "../context";
import { buildTools } from "./tools";

// Kept static (no dates, no names) so providers can cache it.
const INSTRUCTIONS = `You are LiftLedger's coach inside Telegram. You answer questions about the user's own workouts (from Hevy), nutrition log, bodyweight and Apple Health data.

How to work:
- Always get numbers from tools. Never invent or estimate data you could look up. If a tool returns nothing, say so plainly.
- Muscle questions ("biceps", "arms", "how's my back"): call get_muscle_progress — it already finds every exercise that trains that muscle from Hevy's muscle tags, so don't ask the user to name exercises.
- One lift: get_exercise_progress. If it returns candidates, pick the obvious one or ask which they meant.
- "Am I hitting my goals / what am I overeating on / what's stopping me": get_nutrition_summary, then get_top_foods (only_over_goal_days=true when they're over). Point to the 2–3 specific foods or times of day that explain the gap, with numbers, and one concrete swap.
- Dates: the user message states today's date and timezone. "Yesterday", "last week" etc. are relative to that.
- Weights in tool results are already in the user's units (see "units").

Style: concise Telegram messages, no headings. Lead with the answer in one sentence, then at most 5 short bullet lines with the key numbers. Use plain text; *bold* sparingly. Don't mention tools or JSON.`;

async function history(userId: string): Promise<ModelMessage[]> {
  const rows = must(
    await db
      .from("bot_messages")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 3 * 3600_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(8),
  );
  return rows.reverse().map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
}

export async function answerQuestion(
  ctx: UserContext,
  model: LanguageModel,
  question: string,
): Promise<string> {
  const started = Date.now();
  const prior = await history(ctx.userId);
  try {
    const result = await generateText({
      model,
      instructions: INSTRUCTIONS,
      messages: [
        ...prior,
        {
          role: "user",
          content: `[Today is ${ctx.today} (${ctx.timezone}). Units: ${ctx.units}.]\n${question}`,
        },
      ],
      tools: buildTools(ctx),
      stopWhen: stepCountIs(7),
      timeout: 300_000,
    });
    await logAiCall(ctx.userId, "agent", started, {
      usage: result.totalUsage,
      toolCalls: result.steps.flatMap((s) =>
        s.toolCalls.map((c) => ({ tool: c.toolName, input: c.input })),
      ),
    });
    return (
      result.text.trim() ||
      "I couldn't put an answer together for that — try asking it another way."
    );
  } catch (e) {
    await logAiCall(ctx.userId, "agent", started, { error: e });
    throw e;
  }
}
