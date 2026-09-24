import { describe, expect, it } from "vitest";
import { sanitizeOps } from "./pipeline";
import { groundUserValues } from "./resolve";
import type { ParsedItem } from "./schema";

const item = (user: Partial<ParsedItem["user_values"]>): ParsedItem => ({
  name: "black beans",
  brand: null,
  quantity: 1,
  unit: "cup",
  grams_estimate: 172,
  user_values: {
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    fiber_g: null,
    ...user,
  },
  estimate: { calories: 227, protein_g: 15, carbs_g: 41, fat_g: 1, fiber_g: 15 },
  search_query: "black beans",
});

describe("groundUserValues", () => {
  it("keeps numbers the user typed and drops invented ones", () => {
    const [g] = groundUserValues(
      [item({ calories: 50, protein_g: 200, carbs_g: 40 })],
      "1 cup of black beans 50 cals 200g protein",
    );
    expect(g?.user_values).toMatchObject({ calories: 50, protein_g: 200, carbs_g: null });
  });
});

describe("sanitizeOps", () => {
  it("drops added foods the correction never mentioned", () => {
    const ops = sanitizeOps(
      [
        { op: "scale_all", factor: 2 },
        { op: "add_items", text: "3 servings black beans" },
      ],
      "actually that was 2 cups",
    );
    expect(ops).toEqual([{ op: "scale_all", factor: 2 }]);
  });

  it("keeps added foods that were mentioned", () => {
    expect(sanitizeOps([{ op: "add_items", text: "a banana" }], "also had a banana")).toHaveLength(
      1,
    );
  });
});
