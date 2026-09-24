import { describe, expect, it } from "vitest";
import { quickIntent } from "./router";

describe("quickIntent", () => {
  it("routes corrections to the recent meal as edits", () => {
    expect(quickIntent("actually that was 2 cups", 5)).toBe("edit_food");
    expect(quickIntent("remove the milk", 20)).toBe("edit_food");
    expect(quickIntent("actually that was 2 cups", 300)).toBeNull();
  });

  it("routes obvious questions", () => {
    expect(quickIntent("how have my biceps progressed over the last 6 weeks?", null)).toBe(
      "question",
    );
    expect(quickIntent("what did I weigh yesterday", null)).toBe("question");
    expect(quickIntent("have I been hitting my calorie goals", null)).toBe("question");
  });

  it("catches small talk", () => {
    expect(quickIntent("thanks!", 3)).toBe("other");
    expect(quickIntent("hey", null)).toBe("other");
    expect(quickIntent("hey I had a burrito", null)).toBeNull();
  });

  it("leaves food descriptions to the model", () => {
    expect(quickIntent("3 servings of heb premium granola", null)).toBeNull();
    expect(quickIntent("chipotle bowl with double chicken", 10)).toBeNull();
  });
});
