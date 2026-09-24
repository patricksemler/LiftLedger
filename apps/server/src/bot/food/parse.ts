// Turns a food message (text and/or photo) into structured items. The model
// only extracts and estimates here; real numbers come from the resolver.

import { type LanguageModel, Output, generateText } from "ai";
import { logAiCall } from "../ai-log";
import { type ParsedMeal, parsedMealSchema } from "./schema";

const INSTRUCTIONS = `You extract what someone ate from a message (and photo, if given) for a nutrition log.

Rules:
- One item per distinct food. Keep the user's quantities and units exactly ("3 servings", "1 cup", "200 g").
- A number followed by a nutrient word ("50 cals", "200g protein", "30 carbs", "10 fat") is a nutrition value for the food it follows — never a separate item and never its quantity.
- If they state numbers (calories, protein...), copy them into user_values for that item exactly as stated, even if they look wrong. Never put your own guesses in user_values.
- estimate: your best reference-value estimate for the whole quantity (USDA-style), always filled.
- grams_estimate: total grams for the stated quantity (a cup of cooked beans ≈ 172 g; a slice of bread ≈ 30 g). For photos, estimate portions visually.
- brand: only if stated or clearly visible (e.g. "heb" → "HEB").
- search_query: what you'd type into a food database; include the brand when there is one.
- is_food=false for anything that isn't food/drink someone consumed (a question, a gym photo, a screenshot).`;

export async function parseFood(
  userId: string,
  model: LanguageModel,
  input: { text: string | null; image: Uint8Array | null; today: string },
): Promise<ParsedMeal> {
  const started = Date.now();
  const content: Array<
    { type: "text"; text: string } | { type: "image"; image: Uint8Array; mediaType: string }
  > = [
    {
      type: "text",
      text: `Today is ${input.today}.\n${input.text ? `Message: ${input.text}` : "No caption — describe the meal in the photo."}`,
    },
  ];
  if (input.image) content.push({ type: "image", image: input.image, mediaType: "image/jpeg" });

  try {
    const result = await generateText({
      model,
      instructions: INSTRUCTIONS,
      messages: [{ role: "user", content }],
      output: Output.object({ schema: parsedMealSchema }),
      timeout: 180_000,
    });
    await logAiCall(userId, input.image ? "food.parse_photo" : "food.parse", started, {
      usage: result.usage,
    });
    return result.output;
  } catch (e) {
    await logAiCall(userId, "food.parse", started, { error: e });
    throw e;
  }
}
