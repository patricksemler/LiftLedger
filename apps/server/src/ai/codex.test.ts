import { describe, expect, it } from "vitest";
import { renderPrompt, strictify } from "./codex";

describe("strictify", () => {
  it("requires every property and closes objects, recursively", () => {
    const s = strictify({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        a: { type: "string" },
        b: { type: "object", properties: { c: { type: ["number", "null"] } }, required: [] },
      },
      required: ["a"],
    });
    expect(s).toEqual({
      type: "object",
      properties: {
        a: { type: "string" },
        b: {
          type: "object",
          properties: { c: { type: ["number", "null"] } },
          required: ["c"],
          additionalProperties: false,
        },
      },
      required: ["a", "b"],
      additionalProperties: false,
    });
  });
});

describe("renderPrompt", () => {
  it("flattens system, turns, tool calls/results and images", () => {
    const r = renderPrompt([
      { role: "system", content: "Be brief." },
      {
        role: "user",
        content: [
          { type: "text", text: "what is this?" },
          {
            type: "file",
            mediaType: "image/jpeg",
            data: { type: "data", data: new Uint8Array([1, 2]) },
          },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "1", toolName: "get_meals", input: { date: null } },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "1",
            toolName: "get_meals",
            output: { type: "json", value: { n: 1 } },
          },
        ],
      },
    ]);
    expect(r.images).toHaveLength(1);
    expect(r.text).toContain("## Instructions\nBe brief.");
    expect(r.text).toContain("[image 1 attached]");
    expect(r.text).toContain('[called tool get_meals with {"date":null}]');
    expect(r.text).toContain('[result of get_meals]: {"n":1}');
  });
});
