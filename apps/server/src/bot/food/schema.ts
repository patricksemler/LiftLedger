import { z } from "zod";

const macrosPartial = z.object({
  calories: z.number().nullable(),
  protein_g: z.number().nullable(),
  carbs_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  fiber_g: z.number().nullable(),
});

export const parsedItemSchema = z.object({
  name: z.string().describe("Food name without quantity, e.g. 'black beans', 'premium granola'"),
  brand: z.string().nullable().describe("Brand or store if stated or clearly visible, e.g. 'HEB'"),
  quantity: z.number().nullable().describe("Numeric amount the user gave, e.g. 1, 3, 0.5"),
  unit: z
    .string()
    .nullable()
    .describe("Unit for quantity: 'cup', 'g', 'oz', 'tbsp', 'serving', 'piece', 'slice'..."),
  grams_estimate: z
    .number()
    .nullable()
    .describe("Your best estimate of the total grams for this quantity"),
  user_values: macrosPartial.describe(
    "Numbers the user EXPLICITLY stated for this item (for the whole quantity). null for anything they didn't say.",
  ),
  estimate: macrosPartial.describe(
    "Your own estimate of this item's nutrition for the whole quantity, from typical reference values.",
  ),
  search_query: z
    .string()
    .describe(
      "Short query for a nutrition database, e.g. 'black beans canned' or 'HEB premium granola'",
    ),
});

export type ParsedItem = z.infer<typeof parsedItemSchema>;

export const parsedMealSchema = z.object({
  is_food: z.boolean().describe("false if this isn't describing food or drink that was eaten"),
  title: z.string().describe("Short meal title, e.g. 'Chicken burrito bowl'"),
  eaten_at_hint: z
    .string()
    .nullable()
    .describe(
      "If the user said when they ate it ('for breakfast', 'last night at 9'), an ISO 8601 local datetime; otherwise null",
    ),
  items: z.array(parsedItemSchema),
});

export type ParsedMeal = z.infer<typeof parsedMealSchema>;

export const editSchema = z.object({
  operations: z.array(
    z.discriminatedUnion("op", [
      z.object({ op: z.literal("scale_all"), factor: z.number().positive() }),
      z.object({
        op: z.literal("scale_item"),
        item: z.number().int(),
        factor: z.number().positive(),
      }),
      z.object({ op: z.literal("remove_item"), item: z.number().int() }),
      z.object({
        op: z.literal("set_item_values"),
        item: z.number().int(),
        calories: z.number().nullable(),
        protein_g: z.number().nullable(),
        carbs_g: z.number().nullable(),
        fat_g: z.number().nullable(),
      }),
      z.object({
        op: z.literal("add_items"),
        text: z.string().describe("The added food, as the user said it"),
      }),
      z.object({ op: z.literal("rename"), title: z.string() }),
    ]),
  ),
});

export type EditOps = z.infer<typeof editSchema>;
